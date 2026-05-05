"""
KOOS Server – Router: Regelungen
GET    /api/regelungen           → alle Regelungen als JSON-Liste
GET    /api/regelungen/{id}      → einzelne Regelung
PUT    /api/regelungen/{id}      → Regelung speichern (JSON oder MD)
DELETE /api/regelungen/{id}      → Regelung-Datei löschen
GET    /api/regelungen/{id}/raw  → Rohtext der .md-Datei
"""
from __future__ import annotations
import re
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request, Response

import config
from services import git_service
from services.parser import parse_frontmatter, cache_invalidieren

router = APIRouter(prefix="/api/regelungen", tags=["Regelungen"])

_ID_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{0,63}$")

REGELUNGEN_DIR: Path = config.DATA_DIR / "regelungen"


def _datei(reg_id: str) -> Path:
    if not _ID_RE.match(reg_id):
        raise HTTPException(400, detail="Ungültige Regelungs-ID")
    return REGELUNGEN_DIR / f"{reg_id}.md"


def _parse(dateiname: str, text: str) -> dict:
    import re as _re
    fm_re = _re.compile(r"^---\r?\n([\s\S]*?)\r?\n---", _re.MULTILINE)
    import yaml
    m = fm_re.match(text)
    meta = yaml.safe_load(m.group(1)) if m else {}
    body = text[m.end():].strip() if m else text.strip()
    return {
        "id":                    meta.get("id", dateiname),
        "_dateiname":            dateiname,
        "name":                  meta.get("name", ""),
        "typ":                   meta.get("typ", ""),
        "status":                meta.get("status", "aktiv"),
        "datum":                 str(meta["datum"]) if meta.get("datum") else None,
        "entscheidendesGremium": meta.get("entscheidendes-gremium", ""),
        "ersetzt":               meta.get("ersetzt", None),
        "zustaendigeEinheit":    meta.get("zustaendigeEinheit") or meta.get("zuständige-einheit", ""),
        "kontext":               meta.get("kontext", ""),
        "entscheidung":          meta.get("entscheidung", ""),
        "alternativen":          meta.get("alternativen", []),
        "body":                  body,
    }


def _lade_alle() -> list[dict]:
    if not REGELUNGEN_DIR.is_dir():
        return []
    ergebnisse = []
    for datei in REGELUNGEN_DIR.glob("*.md"):
        ergebnisse.append(_parse(datei.stem, datei.read_text(encoding="utf-8")))
    ergebnisse.sort(key=lambda r: r["name"].lower())
    return ergebnisse


@router.get("", summary="Alle Regelungen")
def get_alle() -> list[dict]:
    return _lade_alle()


@router.get("/{reg_id}", summary="Einzelne Regelung")
def get_eine(reg_id: str) -> dict:
    datei = _datei(reg_id)
    if not datei.exists():
        raise HTTPException(404, detail=f"Regelung '{reg_id}' nicht gefunden")
    return _parse(reg_id, datei.read_text(encoding="utf-8"))


@router.get("/{reg_id}/raw", summary="Rohtext der Regelungs-Datei")
def get_raw(reg_id: str) -> Response:
    datei = _datei(reg_id)
    if not datei.exists():
        raise HTTPException(404, detail=f"Regelung '{reg_id}' nicht gefunden")
    return Response(content=datei.read_text(encoding="utf-8"), media_type="text/markdown; charset=utf-8")


@router.put("/{reg_id}", summary="Regelung speichern")
async def put_regelung(reg_id: str, request: Request) -> dict:
    datei = _datei(reg_id)
    REGELUNGEN_DIR.mkdir(parents=True, exist_ok=True)
    content_type = request.headers.get("content-type", "")
    begruendung = None
    if "application/json" in content_type:
        import yaml
        data: dict = await request.json()
        begruendung = data.pop("_begruendung", None)
        clean = {k: v for k, v in data.items() if not k.startswith("_") and k != "body"}
        body = data.get("body", "")
        md_text = f"---\n{yaml.dump(clean, allow_unicode=True, default_flow_style=False, sort_keys=False)}---\n\n{body}"
    else:
        md_text = (await request.body()).decode("utf-8")
    datei.write_text(md_text, encoding="utf-8")
    git_service.commit([datei], f"Regelung {reg_id} gespeichert", begruendung=begruendung)
    cache_invalidieren()
    return {"ok": True, "id": reg_id}


@router.delete("/{reg_id}", summary="Regelung löschen")
def delete_regelung(reg_id: str) -> dict:
    datei = _datei(reg_id)
    if not datei.exists():
        raise HTTPException(404, detail=f"Regelung '{reg_id}' nicht gefunden")
    datei.unlink()
    git_service.commit([datei], f"Regelung {reg_id} gelöscht")
    cache_invalidieren()
    return {"ok": True, "id": reg_id}
