"""
KOOS Server – Konfiguration
Alle pfadbezogenen Einstellungen werden aus Umgebungsvariablen gelesen;
Standardwerte sind relativ zum Server-Verzeichnis sinnvoll für die
Entwicklungsumgebung.
"""
import os
from pathlib import Path

# Wurzel des KOOS-Datenverzeichnisses (enthält orga.yaml, prozesse/, daten/)
# Umgebungsvariable KOOS_DATA_DIR überschreibt den Standardwert.
_default_data = Path(__file__).parent.parent
DATA_DIR: Path = Path(os.environ.get("KOOS_DATA_DIR", str(_default_data))).resolve()

# Host und Port des Servers
HOST: str = os.environ.get("KOOS_HOST", "0.0.0.0")
PORT: int = int(os.environ.get("KOOS_PORT", "8090"))

# Erlaubte CORS-Ursprünge (für Entwicklung offen, in Produktion einschränken)
CORS_ORIGINS: list[str] = os.environ.get(
    "KOOS_CORS_ORIGINS", "http://localhost:8090,http://127.0.0.1:8090"
).split(",")

# Git-Commit-Autor (Name, E-Mail) für den Audit-Trail
GIT_AUTHOR_NAME:  str = os.environ.get("KOOS_GIT_AUTHOR_NAME",  "KOOS-Server")
GIT_AUTHOR_EMAIL: str = os.environ.get("KOOS_GIT_AUTHOR_EMAIL", "koos@localhost")

# Unterverzeichnisse (relativ zu DATA_DIR)
PROZESSE_DIR:   Path = DATA_DIR / "prozesse"
DATEN_DIR:      Path = DATA_DIR / "daten"
REGELUNGEN_DIR: Path = DATA_DIR / "regelungen"
VVT_DIR:        Path = DATA_DIR / "vvt"
ORGA_FILE:      Path = DATA_DIR / "orga.yaml"

# Pfad zur GUI (index.html) — liegt standardmäßig im Server-Verzeichnis
# Überschreibbar via KOOS_GUI_PATH für abweichende Deployments
GUI_PATH: Path = Path(os.environ.get(
    "KOOS_GUI_PATH",
    str(Path(__file__).parent / "index.html")
))

# Static-Files: DATA_DIR für zusätzliche statische Ressourcen
STATIC_DIR: Path = DATA_DIR

# ── Ollama / LLM ──────────────────────────────────────────────────────────────
OLLAMA_URL:   str = os.environ.get("OLLAMA_URL",   "http://localhost:11434")
OLLAMA_MODEL: str = os.environ.get("OLLAMA_MODEL", "llama3.2")
