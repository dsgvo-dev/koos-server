"""
KOOS Server – Router: Statistiken
GET  /api/stats                  → Systemübersicht (Zähler, Verteilungen)
GET  /api/stats/daten            → Detailstatistiken für Datenspeicher
GET  /api/stats/prozesse         → Detailstatistiken für Prozesse
GET  /api/stats/ohne-prozess     → Datenspeicher ohne Prozesszuordnung
"""
from __future__ import annotations
from collections import Counter
from fastapi import APIRouter

import config
from services import parser

router = APIRouter(prefix="/api/stats", tags=["Statistiken"])


def _orga_count() -> int:
    if not config.ORGA_FILE.exists():
        return 0
    text = config.ORGA_FILE.read_text(encoding="utf-8")
    return len(parser.parse_orga_yaml(text))


@router.get("", summary="Systemübersicht")
def get_stats() -> dict:
    """Aggregierte Kennzahlen über alle KOOS-Entitäten."""
    prozesse = parser.lade_alle_prozesse(config.PROZESSE_DIR)
    daten    = parser.lade_alle_daten(config.DATEN_DIR)

    # ── Prozesse ──────────────────────────────────────────────────────────────
    p_status     = Counter(p.get("status", "aktiv") or "aktiv" for p in prozesse)
    p_ohne_daten = sum(
        1 for p in prozesse
        if not any([
            p.get("daten", {}).get("input"),
            p.get("daten", {}).get("output"),
            p.get("daten", {}).get("datenspeicher"),
        ])
    )

    # ── Datenspeicher ─────────────────────────────────────────────────────────
    d_typ          = Counter(d.get("typ", "datenspeicher") or "datenspeicher" for d in daten)
    d_schutzstufe  = Counter(d.get("schutzstufe", "") or "—" for d in daten)
    d_schutzbedarf = Counter(d.get("schutzbedarf", "") or "—" for d in daten)
    d_vertraulich  = Counter(d.get("vertraulichkeit", "") or "—" for d in daten)
    d_ohne_schutz  = sum(1 for d in daten if not d.get("schutzstufe"))
    d_ohne_system  = sum(1 for d in daten if not d.get("system"))

    return {
        "orga": {
            "einheiten": _orga_count(),
        },
        "prozesse": {
            "gesamt":     len(prozesse),
            "nach_status": dict(p_status),
            "ohne_daten":  p_ohne_daten,
        },
        "daten": {
            "gesamt":            len(daten),
            "nach_typ":          dict(d_typ),
            "nach_schutzstufe":  dict(d_schutzstufe),
            "nach_schutzbedarf": dict(d_schutzbedarf),
            "nach_vertraulichkeit": dict(d_vertraulich),
            "ohne_schutzstufe":  d_ohne_schutz,
            "ohne_system":       d_ohne_system,
        },
    }


@router.get("/daten", summary="Detailstatistiken Datenspeicher")
def get_stats_daten() -> dict:
    """Vollständige Verteilungen und Qualitätsprüfung für alle Datenspeicher."""
    daten = parser.lade_alle_daten(config.DATEN_DIR)

    # Vollständigkeit
    fehlend_schutzstufe  = [d["id"] for d in daten if not d.get("schutzstufe")]
    fehlend_schutzbedarf = [d["id"] for d in daten if not d.get("schutzbedarf")]
    fehlend_vertraulich  = [d["id"] for d in daten if not d.get("vertraulichkeit")]
    fehlend_system       = [d["id"] for d in daten if not d.get("system")]
    fehlend_aufbewahrung = [
        d["id"] for d in daten
        if not d.get("aufbewahrung", {}).get("frist")
    ]

    # Kategorien
    kategorien = Counter(d.get("datenkategorie", "—") or "—" for d in daten)

    return {
        "gesamt": len(daten),
        "verteilungen": {
            "typ":           dict(Counter(d.get("typ", "datenspeicher") or "datenspeicher" for d in daten)),
            "schutzstufe":   dict(Counter(d.get("schutzstufe", "—") or "—" for d in daten)),
            "schutzbedarf":  dict(Counter(d.get("schutzbedarf", "—") or "—" for d in daten)),
            "vertraulichkeit": dict(Counter(d.get("vertraulichkeit", "—") or "—" for d in daten)),
            "datenkategorie": dict(kategorien),
        },
        "vollstaendigkeit": {
            "ohne_schutzstufe":  {"anzahl": len(fehlend_schutzstufe),  "ids": fehlend_schutzstufe[:20]},
            "ohne_schutzbedarf": {"anzahl": len(fehlend_schutzbedarf), "ids": fehlend_schutzbedarf[:20]},
            "ohne_vertraulichkeit": {"anzahl": len(fehlend_vertraulich), "ids": fehlend_vertraulich[:20]},
            "ohne_system":       {"anzahl": len(fehlend_system),       "ids": fehlend_system[:20]},
            "ohne_aufbewahrung": {"anzahl": len(fehlend_aufbewahrung), "ids": fehlend_aufbewahrung[:20]},
        },
    }


@router.get("/ohne-prozess", summary="Datenspeicher ohne Prozesszuordnung")
def get_ohne_prozess() -> dict:
    """
    Gibt alle Datenspeicher zurück, die von keinem Prozess referenziert werden.
    Nützlich für Fragen wie: 'Welche Daten haben keinen Prozess?'
    Gibt ausschließlich echte IDs aus dem KOOS-System zurück.
    """
    alle_daten    = parser.lade_alle_daten(config.DATEN_DIR)
    alle_prozesse = parser.lade_alle_prozesse(config.PROZESSE_DIR)

    # Alle dstore-IDs sammeln die irgendein Prozess referenziert
    referenzierte: set[str] = set()
    for p in alle_prozesse:
        ds_liste = p.get("daten", {}).get("datenspeicher", []) or []
        for eintrag in ds_liste:
            if isinstance(eintrag, dict):
                referenzierte.add(eintrag.get("id", ""))
            elif isinstance(eintrag, str):
                referenzierte.add(eintrag)
    referenzierte.discard("")

    # Datenspeicher ohne Prozesszuordnung
    ohne_prozess = [
        {
            "id":            d["id"],
            "name":          d["name"],
            "typ":           d.get("typ", ""),
            "datenkategorie": d.get("datenkategorie", ""),
            "schutzstufe":   d.get("schutzstufe", ""),
            "zustaendigeEinheit": d.get("zustaendigeEinheit", ""),
        }
        for d in alle_daten
        if d["id"] not in referenzierte
    ]

    return {
        "gesamt_datenspeicher":  len(alle_daten),
        "gesamt_prozesse":       len(alle_prozesse),
        "referenziert":          len(referenzierte),
        "ohne_prozess_anzahl":   len(ohne_prozess),
        "ohne_prozess":          ohne_prozess,
    }


@router.get("/prozesse", summary="Detailstatistiken Prozesse")
def get_stats_prozesse() -> dict:
    """Vollständige Verteilungen und Qualitätsprüfung für alle Prozesse."""
    prozesse = parser.lade_alle_prozesse(config.PROZESSE_DIR)

    fehlend_einheit   = [p["id"] for p in prozesse if not p.get("zustaendigeEinheit")]
    fehlend_regelung  = [p["id"] for p in prozesse if not p.get("regelungen")]
    fehlend_schritte  = [p["id"] for p in prozesse if not p.get("schritte")]
    ohne_datenspeicher = [
        p["id"] for p in prozesse
        if not p.get("daten", {}).get("datenspeicher")
    ]

    # Einheiten-Verteilung
    einheiten_dist = Counter(
        p.get("zustaendigeEinheit", "—") or "—" for p in prozesse
    )

    return {
        "gesamt": len(prozesse),
        "verteilungen": {
            "status":          dict(Counter(p.get("status", "aktiv") or "aktiv" for p in prozesse)),
            "zustaendig":      dict(einheiten_dist.most_common(20)),
        },
        "vollstaendigkeit": {
            "ohne_einheit":        {"anzahl": len(fehlend_einheit),    "ids": fehlend_einheit[:20]},
            "ohne_regelungen":     {"anzahl": len(fehlend_regelung),   "ids": fehlend_regelung[:20]},
            "ohne_schritte":       {"anzahl": len(fehlend_schritte),   "ids": fehlend_schritte[:20]},
            "ohne_datenspeicher":  {"anzahl": len(ohne_datenspeicher), "ids": ohne_datenspeicher[:20]},
        },
    }
