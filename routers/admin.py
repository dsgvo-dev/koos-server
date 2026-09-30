"""
KOOS Server – Router: Admin
POST  /api/admin/cache/refresh    → Parser-Cache leeren (nach manuellen Dateiänderungen)
POST  /api/admin/reindex           → Embedding-Index neu aufbauen (nach Batch-Import)
"""
from __future__ import annotations
import subprocess
import sys
from pathlib import Path
from fastapi import APIRouter

from services.parser import cache_invalidieren

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.post("/cache/refresh", summary="Parser-Cache leeren")
def cache_refresh() -> dict:
    """
    Leert den In-Memory-Cache des Parsers. Notwendig, wenn Dateien
    außerhalb der WebUI (z.B. per Git-Sync, Skript oder direkt auf
    dem Server) geändert wurden und die Oberfläche noch alte Daten zeigt.
    """
    cache_invalidieren()
    return {"ok": True, "aktion": "cache_invalidiert"}


@router.post("/reindex", summary="Embedding-Index neu aufbauen")
def reindex() -> dict:
    """
    Baut den semantischen Suchindex (koos_embed.py) neu auf.
    Nach Batch-Importen oder Strukturänderungen erforderlich,
    damit die KI-Suche aktuelle Ergebnisse liefert.
    """
    script = Path(__file__).resolve().parent.parent / "koos_embed.py"
    if not script.is_file():
        return {"ok": False, "fehler": "koos_embed.py nicht gefunden"}
    try:
        result = subprocess.run(
            [sys.executable, str(script)],
            capture_output=True,
            text=True,
            timeout=120,
        )
        return {
            "ok": result.returncode == 0,
            "exit_code": result.returncode,
            "output_tail": result.stdout.strip().split("\n")[-3:] if result.stdout else [],
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "fehler": "Timeout nach 120s"}
    except Exception as e:
        return {"ok": False, "fehler": str(e)}