"""
KOOS Server – Haupt-Applikation
Starte mit:  uvicorn main:app --host 0.0.0.0 --port 8090 --reload
Oder:        ./start.sh
"""
from __future__ import annotations
import logging
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

import config
from routers import orga, prozesse, daten, regelungen, stats, llm, chat, koos_config, vvt
from services import git_service

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("koos")

# ── Validierung Datenverzeichnis ──────────────────────────────────────────────
if not config.DATA_DIR.is_dir():
    log.error(
        "DATA_DIR nicht gefunden: %s\n"
        "Bitte Umgebungsvariable KOOS_DATA_DIR setzen.",
        config.DATA_DIR,
    )
    sys.exit(1)

log.info("DATA_DIR: %s", config.DATA_DIR)

# ── Git initialisieren ────────────────────────────────────────────────────────
git_service.git_init_wenn_noetig(config.DATA_DIR)

# ── FastAPI-App ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="KOOS API",
    description=(
        "Kern-Organisations-Operations-System — "
        "REST-API für kommunale Organisationseinheiten, Prozesse und Datenarten."
    ),
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── No-Cache-Middleware für alle /api/-Routen ─────────────────────────────────
@app.middleware("http")
async def no_cache_api(request: Request, call_next) -> Response:
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"
    return response

# ── API-Router ────────────────────────────────────────────────────────────────
app.include_router(orga.router)
app.include_router(prozesse.router)
app.include_router(daten.router)
app.include_router(regelungen.router)
app.include_router(stats.router)
app.include_router(llm.router)
app.include_router(chat.router)
app.include_router(koos_config.router)
app.include_router(vvt.router)


# ── Audit-Log-Endpunkt ────────────────────────────────────────────────────────
@app.get("/api/audit", tags=["Audit"], summary="Letzte Git-Commits")
def get_audit(n: int = 50) -> list[dict]:
    """Gibt die letzten n Git-Commits als Audit-Trail zurück."""
    return git_service.log_lesen(n=min(n, 500))


@app.get("/api/audit/{commit_hash}/diff", tags=["Audit"], summary="Diff eines Commits")
def get_diff(commit_hash: str) -> dict:
    """
    Gibt den git diff eines einzelnen Commits zurück.
    Response: { "hash": str, "diff": str, "dateien": [str] }
    """
    import re
    if not re.match(r"^[0-9a-f]{4,40}$", commit_hash):
        raise HTTPException(400, detail="Ungültiger Commit-Hash")
    diff_text = git_service.diff_lesen(commit_hash)
    dateien   = git_service.commit_dateien(commit_hash)
    return {"hash": commit_hash, "diff": diff_text, "dateien": dateien}


@app.post("/api/audit/{commit_hash}/revert", tags=["Audit"], summary="Commit rückgängig machen")
def post_revert(commit_hash: str) -> dict:
    """
    Macht die Änderungen eines einzelnen Commits rückgängig.
    Erstellt einen neuen 'Rückgängig'-Commit — die Historie bleibt erhalten.
    """
    import re
    if not re.match(r"^[0-9a-f]{4,40}$", commit_hash):
        raise HTTPException(400, detail="Ungültiger Commit-Hash")
    from services.parser import cache_invalidieren
    ok, fehler = git_service.revert_commit(commit_hash)
    if not ok:
        raise HTTPException(500, detail=f"Revert fehlgeschlagen: {fehler}")
    cache_invalidieren()
    return {"ok": True, "hash": commit_hash}


# ── Health-Check ──────────────────────────────────────────────────────────────
@app.get("/api/health", tags=["System"], summary="Health-Check")
def health() -> dict:
    return {
        "status": "ok",
        "data_dir": str(config.DATA_DIR),
        "orga_vorhanden":     config.ORGA_FILE.exists(),
        "prozesse_vorhanden": config.PROZESSE_DIR.is_dir(),
        "daten_vorhanden":    config.DATEN_DIR.is_dir(),
    }


# ── Static Files (index.html) ────────────────────────────────────────────────
# GUI-Datei: index.html aus Server-Verzeichnis (konfigurierbar via KOOS_GUI_PATH)
# Alle nicht-API-Routen → index.html (Single-Page-App)

if config.STATIC_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=str(config.STATIC_DIR)), name="static")

if config.GUI_PATH.is_file():
    @app.get("/", include_in_schema=False)
    def root() -> FileResponse:
        return FileResponse(str(config.GUI_PATH))

    @app.get("/{pfad:path}", include_in_schema=False)
    def catch_all(pfad: str) -> FileResponse:
        """Alle anderen Pfade → index.html (für Client-side Routing)."""
        datei = config.STATIC_DIR / pfad
        if datei.is_file():
            return FileResponse(str(datei))
        return FileResponse(str(config.GUI_PATH))
else:
    log.warning("GUI_PATH nicht gefunden: %s — kein GUI-Serving", config.GUI_PATH)


# ── Fehlerbehandlung ──────────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    log.exception("Unerwarteter Fehler: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Interner Serverfehler"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=config.HOST, port=config.PORT, reload=True)
