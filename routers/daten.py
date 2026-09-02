"""
KOOS Server – Router: Datenarten
GET    /api/daten           → alle Datenarten als JSON-Liste
GET    /api/daten/{id}      → einzelne Datenart
PUT    /api/daten/{id}      → Datenart speichern (JSON oder MD)
DELETE /api/daten/{id}      → Datenart-Datei löschen
GET    /api/daten/{id}/raw  → Rohtext der .md-Datei
"""
from __future__ import annotations
import re
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request, Response

import config
from services import parser, git_service
from services.parser import cache_invalidieren

router = APIRouter(prefix="/api/daten", tags=["Daten"])

_ID_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{0,126}$")


def _datei(daten_id: str) -> Path:
    if not _ID_RE.match(daten_id):
        raise HTTPException(400, detail="Ungültige Daten-ID")
    return config.DATEN_DIR / f"{daten_id}.md"


@router.get("", summary="Alle Datenarten")
def get_alle() -> list[dict]:
    return parser.lade_alle_daten(config.DATEN_DIR)


@router.get("/{daten_id}", summary="Einzelne Datenart")
def get_eine(daten_id: str) -> dict:
    datei = _datei(daten_id)
    if not datei.exists():
        raise HTTPException(404, detail=f"Datenart '{daten_id}' nicht gefunden")
    text = datei.read_text(encoding="utf-8")
    return parser.parse_daten_md(daten_id, text)


@router.get("/{daten_id}/raw", summary="Rohtext der Daten-Datei")
def get_raw(daten_id: str) -> Response:
    datei = _datei(daten_id)
    if not datei.exists():
        raise HTTPException(404, detail=f"Datenart '{daten_id}' nicht gefunden")
    return Response(content=datei.read_text(encoding="utf-8"), media_type="text/markdown; charset=utf-8")


@router.put("/{daten_id}", summary="Datenart speichern")
async def put_daten(daten_id: str, request: Request) -> dict:
    """
    Akzeptiert JSON (strukturiertes Dict) oder Markdown-Rohtext.
    Erstellt nur dann einen Git-Commit, wenn sich der Inhalt tatsächlich
    geändert hat.
    """
    datei = _datei(daten_id)
    config.DATEN_DIR.mkdir(parents=True, exist_ok=True)

    existiert_vorher = datei.exists()

    begruendung = None
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        data: dict = await request.json()
        begruendung = data.pop("_begruendung", None)
        md_text = parser.daten_to_md_merge(
            data, datei if existiert_vorher else None
        )

        # Vergleich: vorhandene Datei durch dieselbe Pipeline
        if existiert_vorher:
            rohtext = datei.read_text(encoding="utf-8")
            parsed = parser.parse_daten_md(daten_id, rohtext)
            roundtrip = parser.daten_to_md_merge(parsed, datei)
            if md_text == roundtrip:
                return {"ok": True, "id": daten_id, "gespeichert": False}
    else:
        md_text = (await request.body()).decode("utf-8")
        # Rohtext: direkter Vergleich
        if existiert_vorher and md_text == datei.read_text(encoding="utf-8"):
            return {"ok": True, "id": daten_id, "gespeichert": False}

    datei.write_text(md_text, encoding="utf-8")
    git_service.commit([datei], f"Datenart {daten_id} gespeichert",
                       begruendung=begruendung)
    cache_invalidieren()
    return {"ok": True, "id": daten_id, "gespeichert": True}


@router.delete("/{daten_id}", summary="Datenart löschen")
def delete_daten(daten_id: str) -> dict:
    datei = _datei(daten_id)
    if not datei.exists():
        raise HTTPException(404, detail=f"Datenart '{daten_id}' nicht gefunden")
    datei.unlink()
    git_service.commit([datei], f"Datenart {daten_id} gelöscht")
    cache_invalidieren()
    return {"ok": True, "id": daten_id}
