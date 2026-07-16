"""
KOOS Server – Router: VVT (Verzeichnis von Verarbeitungstätigkeiten)
GET    /api/vvt                       → alle VVT-Einträge als JSON-Liste
GET    /api/vvt?fields=uid,titel,...  → gefilterte Feldauswahl
GET    /api/vvt/{id}                  → einzelner VVT-Eintrag (Frontmatter)
GET    /api/vvt/{id}?section=body     → nur Markdown-Body
GET    /api/vvt/{id}?section=all      → Frontmatter + Body
GET    /api/vvt/{id}/schutzstufe      → aus verknüpften dstore-* abgeleitete Schutzstufe
GET    /api/vvt/{id}/validierung      → prüft prozesse:/datenspeicher:-Referenzen auf Existenz
GET    /api/vvt/_validierung/alle     → Referenz-Validierung über den gesamten VVT-Bestand
PUT    /api/vvt/{id}                  → VVT-Eintrag speichern (lehnt verwaiste Referenzen mit 422 ab)
DELETE /api/vvt/{id}                  → VVT-Datei löschen
GET    /api/vvt/{id}/raw              → Rohtext der .md-Datei

Bezug: ADR 001 (documentation/entscheidungen/001-vvt-wohnort.md) — VVT lebt
im KOOS-Server, nicht im DSMS. Schutzstufe wird gemäß Richtlinie zur
Datenklassifizierung (reg-klassifizierung-001.md, Punkt 4.2) ausschließlich
an dstore-* geführt und hier nur abgeleitet, nie am VVT selbst gespeichert.
"""
from __future__ import annotations
import re
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Request, Response

import config
from services import parser, git_service
from services.parser import cache_invalidieren

router = APIRouter(prefix="/api/vvt", tags=["VVT"])

_ID_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{0,63}$")
_SECTION_VALUES = {"frontmatter", "body", "all"}


def _datei(vvt_id: str) -> Path:
    if not _ID_RE.match(vvt_id):
        raise HTTPException(400, detail="Ungültige VVT-ID")
    return config.VVT_DIR / f"{vvt_id}.md"


@router.get("", summary="Alle VVT-Einträge")
def get_alle(
    fields: Optional[str] = Query(
        None,
        description="Kommagetrennte Feldnamen, z. B. ?fields=uid,titel,organisationseinheit",
    ),
) -> list[dict]:
    alle = parser.lade_alle_vvt(config.VVT_DIR)
    return parser.filtere_felder(alle, fields)


@router.get("/_validierung/alle", summary="Referenz-Validierung über den gesamten VVT-Bestand")
def get_validierung_alle() -> dict:
    """
    Prüft für jeden VVT-Eintrag, ob die referenzierten prozesse:/datenspeicher:
    tatsächlich existierende KOOS-Dateien sind. Meldet verwaiste Referenzen,
    OHNE etwas zu ändern.
    """
    alle_vvt      = parser.lade_alle_vvt(config.VVT_DIR)
    alle_prozesse = parser.lade_alle_prozesse(config.PROZESSE_DIR)
    alle_daten    = parser.lade_alle_daten(config.DATEN_DIR)

    ergebnisse = []
    fehler_anzahl = 0
    for v in alle_vvt:
        pruefung = parser.validiere_vvt_referenzen(v, alle_prozesse, alle_daten)
        if not pruefung["gueltig"]:
            fehler_anzahl += 1
        ergebnisse.append({"id": v["id"], "uid": v["uid"], **pruefung})

    return {
        "gesamt_vvt": len(alle_vvt),
        "mit_verwaisten_referenzen": fehler_anzahl,
        "eintraege": ergebnisse,
    }


@router.get("/{vvt_id}", summary="Einzelner VVT-Eintrag", response_model=None)
def get_einen(
    vvt_id: str,
    section: Optional[str] = Query(None, description="'frontmatter' (Standard), 'body' oder 'all'"),
) -> dict | Response:
    datei = _datei(vvt_id)
    if not datei.exists():
        raise HTTPException(404, detail=f"VVT-Eintrag '{vvt_id}' nicht gefunden")

    if section and section not in _SECTION_VALUES:
        raise HTTPException(400, detail=f"Ungültiger section-Wert '{section}'. Erlaubt: {sorted(_SECTION_VALUES)}")

    text = datei.read_text(encoding="utf-8")

    if section == "body":
        _, body = parser.parse_frontmatter(text)
        return Response(content=body, media_type="text/markdown; charset=utf-8")

    meta = parser.parse_vvt_md(vvt_id, text)
    if section != "all":
        meta = {k: v for k, v in meta.items() if k != "body"}
    return meta


@router.get("/{vvt_id}/schutzstufe", summary="Abgeleitete Schutzstufe aus verknüpften dstore-*")
def get_schutzstufe(vvt_id: str) -> dict:
    datei = _datei(vvt_id)
    if not datei.exists():
        raise HTTPException(404, detail=f"VVT-Eintrag '{vvt_id}' nicht gefunden")
    meta = parser.parse_vvt_md(vvt_id, datei.read_text(encoding="utf-8"))
    alle_daten = parser.lade_alle_daten(config.DATEN_DIR)
    return {"id": vvt_id, **parser.leite_schutzstufe_ab(meta, alle_daten)}


@router.get("/{vvt_id}/validierung", summary="Referenz-Validierung für einen VVT-Eintrag")
def get_validierung(vvt_id: str) -> dict:
    datei = _datei(vvt_id)
    if not datei.exists():
        raise HTTPException(404, detail=f"VVT-Eintrag '{vvt_id}' nicht gefunden")
    meta = parser.parse_vvt_md(vvt_id, datei.read_text(encoding="utf-8"))
    alle_prozesse = parser.lade_alle_prozesse(config.PROZESSE_DIR)
    alle_daten    = parser.lade_alle_daten(config.DATEN_DIR)
    return {"id": vvt_id, **parser.validiere_vvt_referenzen(meta, alle_prozesse, alle_daten)}


@router.get("/{vvt_id}/raw", summary="Rohtext der VVT-Datei")
def get_raw(vvt_id: str) -> Response:
    datei = _datei(vvt_id)
    if not datei.exists():
        raise HTTPException(404, detail=f"VVT-Eintrag '{vvt_id}' nicht gefunden")
    return Response(content=datei.read_text(encoding="utf-8"), media_type="text/markdown; charset=utf-8")


@router.put("/{vvt_id}", summary="VVT-Eintrag speichern")
async def put_vvt(vvt_id: str, request: Request, force: bool = Query(False, description="Speichert auch bei verwaisten Referenzen")) -> dict:
    """
    Akzeptiert JSON (strukturiertes Dict) oder Markdown-Rohtext.
    Lehnt verwaiste prozesse:/datenspeicher:-Referenzen mit 422 ab,
    sofern nicht ?force=true gesetzt ist (vgl. ADR 001, ID-Validierungsfunktion).
    """
    datei = _datei(vvt_id)
    config.VVT_DIR.mkdir(parents=True, exist_ok=True)

    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        data: dict = await request.json()
        alle_prozesse = parser.lade_alle_prozesse(config.PROZESSE_DIR)
        alle_daten    = parser.lade_alle_daten(config.DATEN_DIR)
        pruefung = parser.validiere_vvt_referenzen(data, alle_prozesse, alle_daten)
        if not pruefung["gueltig"] and not force:
            raise HTTPException(422, detail={
                "msg": "Verwaiste Referenz(en) in prozesse:/datenspeicher:",
                **pruefung,
            })
        md_text = parser.vvt_to_md(data)
    else:
        md_text = (await request.body()).decode("utf-8")

    datei.write_text(md_text, encoding="utf-8")
    aktion = "aktualisiert" if datei.exists() else "angelegt"
    git_service.commit([datei], f"VVT {vvt_id} {aktion}")
    cache_invalidieren()
    return {"ok": True, "id": vvt_id}


@router.delete("/{vvt_id}", summary="VVT-Eintrag löschen")
def delete_vvt(vvt_id: str) -> dict:
    datei = _datei(vvt_id)
    if not datei.exists():
        raise HTTPException(404, detail=f"VVT-Eintrag '{vvt_id}' nicht gefunden")
    datei.unlink()
    git_service.commit([datei], f"VVT {vvt_id} gelöscht")
    cache_invalidieren()
    return {"ok": True, "id": vvt_id}
