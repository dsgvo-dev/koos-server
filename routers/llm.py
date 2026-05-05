"""
KOOS Server – Router: LLM-Werkzeuge
Endpunkte optimiert für KI-Assistenten mit Tool Use.

GET  /api/context                   → Systemüberblick (Einstieg für LLM)
GET  /api/search?q=...&in=alle      → Volltext-Suche über alle Entitäten
GET  /api/querverweise/{id}         → Querverweise zu einem Datenspeicher
"""
from __future__ import annotations
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

import config
from services import parser

router = APIRouter(tags=["LLM-Werkzeuge"])

# ── Hilfsfunktionen ──────────────────────────────────────────────────────────

def _treffer(obj: dict, q: str) -> bool:
    """Prüft ob irgendein Textfeld des Dicts den Suchbegriff enthält."""
    q = q.lower()
    for v in obj.values():
        if isinstance(v, str) and q in v.lower():
            return True
        if isinstance(v, list):
            for item in v:
                if isinstance(item, str) and q in item.lower():
                    return True
                if isinstance(item, dict):
                    # z.B. rechtsgrundlagen: {gesetz, artikel, titel}
                    for sv in item.values():
                        if isinstance(sv, str) and q in sv.lower():
                            return True
    return False


def _lade_regelungen() -> list[dict]:
    """Lädt alle Regelungen als kompakte Dicts."""
    reg_dir: Path = config.DATA_DIR / "regelungen"
    if not reg_dir.is_dir():
        return []
    ergebnisse = []
    for datei in reg_dir.glob("*.md"):
        text = datei.read_text(encoding="utf-8")
        meta, _ = parser.parse_frontmatter(text)
        ergebnisse.append({
            "id":   meta.get("id", datei.stem),
            "name": meta.get("name", ""),
            "typ":  meta.get("typ", ""),
        })
    return sorted(ergebnisse, key=lambda r: r["name"].lower())


def _datenspeicher_ids_aus_prozess(proc: dict) -> list[str]:
    """Gibt alle dstore-IDs zurück, die ein Prozess referenziert."""
    ds = proc.get("daten", {}).get("datenspeicher", [])
    ids = []
    for eintrag in (ds or []):
        if isinstance(eintrag, dict):
            ids.append(eintrag.get("id", ""))
        elif isinstance(eintrag, str):
            ids.append(eintrag)
    return [i for i in ids if i]


# ── /api/context ─────────────────────────────────────────────────────────────

@router.get("/api/context", summary="Systemüberblick für LLM-Einstieg")
def get_context() -> dict:
    """
    Gibt einen kompakten Überblick über das KOOS-System zurück.
    Gedacht als erster Aufruf eines KI-Assistenten, um Kontext zu gewinnen.
    """
    prozesse  = parser.lade_alle_prozesse(config.PROZESSE_DIR)
    daten     = parser.lade_alle_daten(config.DATEN_DIR)
    regelungen = _lade_regelungen()

    # Einheiten
    einheiten: list[dict] = []
    if config.ORGA_FILE.exists():
        einheiten = parser.parse_orga_yaml(config.ORGA_FILE.read_text(encoding="utf-8"))

    return {
        "beschreibung": (
            "KOOS – Kern-Organisations-Operations-System. "
            "Wissensmanagement für kommunale Verwaltungseinheiten, "
            "Prozesse, Datenspeicher und Regelungen."
        ),
        "datenstand": str(config.DATA_DIR),
        "zahlen": {
            "organisationseinheiten": len(einheiten),
            "prozesse":               len(prozesse),
            "datenspeicher":          len(daten),
            "regelungen":             len(regelungen),
        },
        "einheiten": [
            {"id": e["id"], "name": e["name"]}
            for e in einheiten
        ],
        "endpunkte": {
            "GET /api/context":           "Dieser Überblick",
            "GET /api/search?q=...&in=alle": "Volltext-Suche (in: prozesse|daten|regelungen|alle)",
            "GET /api/querverweise/{id}": "Querverweise zu einem Datenspeicher (dstore-...)",
            "GET /api/prozesse":          "Alle Prozesse als JSON-Liste",
            "GET /api/prozesse/{id}":     "Einzelner Prozess",
            "GET /api/daten":             "Alle Datenspeicher als JSON-Liste",
            "GET /api/daten/{id}":        "Einzelner Datenspeicher",
            "GET /api/stats":             "Systemstatistiken und Vollständigkeitsprüfung",
            "GET /api/audit":             "Git-Commit-Log (Audit-Trail)",
        },
        "hinweis_suche": (
            "Für Beziehungsfragen ('Welche Prozesse nutzen X?') "
            "GET /api/querverweise/{dstore-id} verwenden. "
            "Für Inhaltssuche GET /api/search?q=Begriff nutzen."
        ),
    }


# ── /api/search ──────────────────────────────────────────────────────────────

@router.get("/api/search", summary="Volltext-Suche über alle Entitäten")
def search(
    q:  str = Query(..., min_length=2, description="Suchbegriff (mind. 2 Zeichen)"),
    in_: str = Query("alle", alias="in", description="prozesse | daten | regelungen | alle"),
) -> dict:
    """
    Durchsucht ID, Titel/Name, Datenkategorie, Gesetz-Abkürzungen u.a.
    Gibt kompakte Trefferlisten zurück — kein komplettes Objekt, nur id + name + typ.
    """
    ergebnis: dict = {}

    if in_ in ("prozesse", "alle"):
        alle_p = parser.lade_alle_prozesse(config.PROZESSE_DIR)
        ergebnis["prozesse"] = [
            {
                "id":     p["id"],
                "titel":  p["titel"],
                "status": p["status"],
                "einheit": p.get("zustaendigeEinheit", ""),
            }
            for p in alle_p if _treffer(p, q)
        ]

    if in_ in ("daten", "alle"):
        alle_d = parser.lade_alle_daten(config.DATEN_DIR)
        ergebnis["daten"] = [
            {
                "id":            d["id"],
                "name":          d["name"],
                "typ":           d.get("typ", ""),
                "datenkategorie": d.get("datenkategorie", ""),
                "schutzstufe":   d.get("schutzstufe", ""),
            }
            for d in alle_d if _treffer(d, q)
        ]

    if in_ in ("regelungen", "alle"):
        alle_r = _lade_regelungen()
        ergebnis["regelungen"] = [
            r for r in alle_r if _treffer(r, q)
        ]

    if in_ not in ("prozesse", "daten", "regelungen", "alle"):
        raise HTTPException(400, detail="Parameter 'in' muss prozesse|daten|regelungen|alle sein")

    # Zusammenfassung
    ergebnis["_suche"] = q
    ergebnis["_treffer_gesamt"] = sum(
        len(v) for k, v in ergebnis.items() if not k.startswith("_")
    )
    return ergebnis


# ── /api/querverweise/{id} ───────────────────────────────────────────────────

@router.get("/api/querverweise/{daten_id}", summary="Querverweise zu einem Datenspeicher")
def get_querverweise(daten_id: str) -> dict:
    """
    Zeigt alle Prozesse, die einen bestimmten Datenspeicher referenzieren,
    sowie die Rechtsgrundlagen des Datenspeichers selbst.
    Nützlich für Fragen wie: 'Welche Prozesse nutzen dstore-meldedaten?'
    """
    # Datenspeicher laden und prüfen
    daten_datei = config.DATEN_DIR / f"{daten_id}.md"
    if not daten_datei.exists():
        raise HTTPException(404, detail=f"Datenspeicher '{daten_id}' nicht gefunden")

    daten_obj = parser.parse_daten_md(
        daten_id, daten_datei.read_text(encoding="utf-8")
    )

    # Alle Prozesse durchsuchen
    alle_prozesse = parser.lade_alle_prozesse(config.PROZESSE_DIR)
    nutzende_prozesse = []
    for p in alle_prozesse:
        if daten_id in _datenspeicher_ids_aus_prozess(p):
            nutzende_prozesse.append({
                "id":     p["id"],
                "titel":  p["titel"],
                "status": p["status"],
                "einheit": p.get("zustaendigeEinheit", ""),
            })

    return {
        "datenspeicher": {
            "id":             daten_obj["id"],
            "name":           daten_obj["name"],
            "typ":            daten_obj.get("typ", ""),
            "datenkategorie": daten_obj.get("datenkategorie", ""),
            "schutzstufe":    daten_obj.get("schutzstufe", ""),
            "schutzbedarf":   daten_obj.get("schutzbedarf", ""),
            "vertraulichkeit": daten_obj.get("vertraulichkeit", ""),
            "rechtsgrundlagen": daten_obj.get("rechtsgrundlagen", []),
            "system":         daten_obj.get("system", ""),
        },
        "genutzt_in_prozessen": nutzende_prozesse,
        "anzahl_prozesse": len(nutzende_prozesse),
    }
