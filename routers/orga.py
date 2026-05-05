"""
KOOS Server – Router: Organisationseinheiten
GET  /api/orga      → alle OE-Einheiten als JSON-Liste
PUT  /api/orga      → orga.yaml überschreiben (JSON-Body)
GET  /api/orga/raw  → orga.yaml als Rohtext
PUT  /api/orga/raw  → orga.yaml als Rohtext speichern
"""
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Request, Response

import config
from services import parser, git_service

router = APIRouter(prefix="/api/orga", tags=["Orga"])


@router.get("", summary="Alle OE-Einheiten")
def get_orga() -> list[dict]:
    if not config.ORGA_FILE.exists():
        raise HTTPException(404, detail="orga.yaml nicht gefunden")
    text = config.ORGA_FILE.read_text(encoding="utf-8")
    return parser.parse_orga_yaml(text)


@router.get("/raw", summary="orga.yaml als Rohtext")
def get_orga_raw() -> Response:
    if not config.ORGA_FILE.exists():
        raise HTTPException(404, detail="orga.yaml nicht gefunden")
    text = config.ORGA_FILE.read_text(encoding="utf-8")
    return Response(content=text, media_type="text/yaml; charset=utf-8")


@router.put("", summary="Organisationsstruktur speichern (JSON)")
async def put_orga(request: Request) -> dict:
    """
    Erwartet einen JSON-Array von OE-Einheiten (gleiche Struktur wie GET).
    Schreibt als YAML zurück und erstellt einen Git-Commit.
    """
    body: list | dict = await request.json()
    # Begründung aus Wrapper-Objekt extrahieren falls vorhanden
    if isinstance(body, dict) and "einheiten" in body:
        begruendung = body.get("_begruendung")
        einheiten = body["einheiten"]
    else:
        begruendung = None
        einheiten = body
    yaml_text = parser.orga_to_yaml(einheiten)
    config.ORGA_FILE.write_text(yaml_text, encoding="utf-8")
    git_service.commit([config.ORGA_FILE], "orga.yaml aktualisiert",
                       begruendung=begruendung)
    return {"ok": True, "einheiten": len(einheiten)}


@router.put("/raw", summary="orga.yaml als Rohtext speichern")
async def put_orga_raw(request: Request) -> dict:
    """
    Erwartet den Rohtext der orga.yaml als Anfrage-Body (text/yaml oder text/plain).
    Validiert durch Parsen, schreibt dann die Originaldatei.
    """
    text = (await request.body()).decode("utf-8")
    # Validierung
    try:
        einheiten = parser.parse_orga_yaml(text)
    except Exception as e:
        raise HTTPException(422, detail=f"Ungültige YAML: {e}")
    config.ORGA_FILE.write_text(text, encoding="utf-8")
    git_service.commit([config.ORGA_FILE], "orga.yaml aktualisiert (raw)")
    return {"ok": True, "einheiten": len(einheiten)}
