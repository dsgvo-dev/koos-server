"""
KOOS Server – Router: Maßnahmen- und Gefährdungskatalog
GET /api/tom/definitionen → alle TOM-Definitionen als JSON-Liste
GET /api/tom/bedrohungen  → alle Gefährdungsdefinitionen als JSON-Liste

Der Katalog wird nur gelesen, nie geschrieben. Gepflegt wird er im DSMS
(`dsms-knowledge/toms/`), wo auch die vier Generatoren ihn lesen, die
`_daten/tom/` erzeugen. Der Pfad steht in config.KATALOG_DIR und ist über
KOOS_KATALOG_DIR überschreibbar.

Fehlt das Verzeichnis, ist die Antwort eine leere Liste und kein Fehler:
der Katalog ist eine Beigabe, der Server läuft ohne ihn.
"""
from __future__ import annotations
import json
from pathlib import Path

from fastapi import APIRouter

import config

router = APIRouter(prefix="/api/tom", tags=["Katalog"])


def _lade(verzeichnis: Path) -> list[dict]:
    """Liest alle *.json eines Katalogverzeichnisses, nach id sortiert.

    Unlesbare oder id-lose Dateien werden übergangen statt den ganzen
    Katalog scheitern zu lassen — eine kaputte Datei darf die übrigen
    132 nicht unsichtbar machen.
    """
    if not verzeichnis.is_dir():
        return []
    eintraege: list[dict] = []
    for datei in sorted(verzeichnis.glob("*.json")):
        try:
            inhalt = json.loads(datei.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(inhalt, dict) and inhalt.get("id"):
            eintraege.append(inhalt)
    eintraege.sort(key=lambda e: str(e.get("id")))
    return eintraege


@router.get("/definitionen", summary="Alle TOM-Definitionen")
def get_definitionen() -> list[dict]:
    return _lade(config.KATALOG_TOM_DIR)


@router.get("/bedrohungen", summary="Alle Gefährdungsdefinitionen")
def get_bedrohungen() -> list[dict]:
    return _lade(config.KATALOG_THREAT_DIR)
