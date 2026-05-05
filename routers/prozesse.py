"""
KOOS Server – Router: Prozesse
GET    /api/prozesse                      → alle Prozesse als JSON-Liste
GET    /api/prozesse?fields=id,titel,...  → gefilterte Feldauswahl (progressive Disclosure)
GET    /api/prozesse/{id}                 → einzelner Prozess (Frontmatter)
GET    /api/prozesse/{id}?section=body    → nur Markdown-Body des Prozesses
GET    /api/prozesse/{id}?section=all     → Frontmatter + Body als JSON
PUT    /api/prozesse/{id}                 → Prozess speichern (JSON oder MD)
DELETE /api/prozesse/{id}                 → Prozess-Datei löschen
GET    /api/prozesse/{id}/raw             → Rohtext der .md-Datei
"""
from __future__ import annotations
import re
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Request, Response

import config
from services import parser, git_service
from services.parser import cache_invalidieren

router = APIRouter(prefix="/api/prozesse", tags=["Prozesse"])

_ID_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{0,63}$")
_SECTION_VALUES = {"frontmatter", "body", "all"}


def _datei(prozess_id: str) -> Path:
    if not _ID_RE.match(prozess_id):
        raise HTTPException(400, detail="Ungültige Prozess-ID")
    return config.PROZESSE_DIR / f"{prozess_id}.md"


@router.get("", summary="Alle Prozesse")
def get_alle(
    fields: Optional[str] = Query(
        None,
        description=(
            "Kommagetrennte Feldnamen für progressive Disclosure. "
            "Beispiel: ?fields=id,titel,zustaendigeEinheit — "
            "gibt nur diese Felder zurück und spart Tokens bei KI-Anfragen. "
            "Ohne Parameter: alle Felder."
        ),
    ),
) -> list[dict]:
    alle = parser.lade_alle_prozesse(config.PROZESSE_DIR)
    return parser.filtere_felder(alle, fields)


@router.get("/{prozess_id}", summary="Einzelner Prozess", response_model=None)
def get_einen(
    prozess_id: str,
    section: Optional[str] = Query(
        None,
        description=(
            "Welcher Teil der Datei zurückgegeben wird. "
            "'frontmatter' (Standard): strukturierte Metadaten als JSON. "
            "'body': Markdown-Inhalt als Text (Zweck, Prozessschritte, Hinweise). "
            "'all': Frontmatter-Dict + body-Feld in einem JSON-Objekt."
        ),
    ),
) -> dict | Response:
    datei = _datei(prozess_id)
    if not datei.exists():
        raise HTTPException(404, detail=f"Prozess '{prozess_id}' nicht gefunden")

    if section and section not in _SECTION_VALUES:
        raise HTTPException(
            400,
            detail=f"Ungültiger section-Wert '{section}'. Erlaubt: {sorted(_SECTION_VALUES)}",
        )

    text = datei.read_text(encoding="utf-8")

    if section == "body":
        body = parser.parse_prozess_body(text)
        return Response(content=body, media_type="text/markdown; charset=utf-8")

    meta = parser.parse_prozess_md(prozess_id, text)

    if section == "all":
        meta["body"] = parser.parse_prozess_body(text)

    return meta


@router.get("/{prozess_id}/raw", summary="Rohtext der Prozess-Datei")
def get_raw(prozess_id: str) -> Response:
    datei = _datei(prozess_id)
    if not datei.exists():
        raise HTTPException(404, detail=f"Prozess '{prozess_id}' nicht gefunden")
    return Response(content=datei.read_text(encoding="utf-8"), media_type="text/markdown; charset=utf-8")


@router.put("/{prozess_id}", summary="Prozess speichern")
async def put_prozess(prozess_id: str, request: Request) -> dict:
    """
    Akzeptiert entweder:
    - JSON-Body (Content-Type: application/json): strukturiertes Prozess-Dict
    - Plaintext/Markdown-Body: Rohtext der .md-Datei
    Erstellt immer einen Git-Commit.
    """
    datei = _datei(prozess_id)
    config.PROZESSE_DIR.mkdir(parents=True, exist_ok=True)

    begruendung = None
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        data: dict = await request.json()
        begruendung = data.pop("_begruendung", None)
        md_text = parser.prozess_to_md(data)
    else:
        md_text = (await request.body()).decode("utf-8")

    datei.write_text(md_text, encoding="utf-8")
    aktion = "aktualisiert" if datei.exists() else "angelegt"
    git_service.commit([datei], f"Prozess {prozess_id} {aktion}",
                       begruendung=begruendung)
    cache_invalidieren()
    return {"ok": True, "id": prozess_id}


@router.delete("/{prozess_id}", summary="Prozess löschen")
def delete_prozess(prozess_id: str) -> dict:
    datei = _datei(prozess_id)
    if not datei.exists():
        raise HTTPException(404, detail=f"Prozess '{prozess_id}' nicht gefunden")
    datei.unlink()
    git_service.commit([datei], f"Prozess {prozess_id} gelöscht")
    cache_invalidieren()
    return {"ok": True, "id": prozess_id}
