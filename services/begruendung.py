"""
Begründung einer Änderung aus der Anfrage lesen.

PUT-Aufrufe tragen sie als Feld `_begruendung` im JSON-Körper. DELETE hat
sonst keinen Körper; Nexus schickt die Begründung dort ebenso als JSON
mit (PLAN-2026-10-23, Stufe 2). Fehlt sie oder ist der Körper kein JSON,
bleibt der Commit ohne Begründung — wie bisher.
"""
from __future__ import annotations

from fastapi import Request


async def begruendung_lesen(request: Request) -> str | None:
    if "application/json" not in request.headers.get("content-type", ""):
        return None
    try:
        daten = await request.json()
    except ValueError:
        return None
    if not isinstance(daten, dict):
        return None
    wert = daten.get("_begruendung")
    return wert.strip() if isinstance(wert, str) and wert.strip() else None
