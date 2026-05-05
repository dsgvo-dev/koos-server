#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# KOOS Server – Erstinstallation (Linux/Debian/Ubuntu)
# Voraussetzung: Python 3.11+, git
# Aufruf: bash install.sh
# ════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"

echo "=== KOOS Server – Installation ==="
echo "Verzeichnis: $SCRIPT_DIR"

# Python-Version prüfen
python3 --version || { echo "FEHLER: Python 3 nicht gefunden"; exit 1; }
PYVER=$(python3 -c "import sys; print(sys.version_info.minor)")
if [ "$PYVER" -lt 11 ]; then
  echo "FEHLER: Python 3.11 oder neuer wird benötigt (gefunden: 3.$PYVER)"
  exit 1
fi

# git prüfen
git --version || { echo "FEHLER: git nicht gefunden. Installation: sudo apt install git"; exit 1; }

# Virtuelle Umgebung anlegen
if [ ! -d "$VENV_DIR" ]; then
  echo "Lege virtuelle Python-Umgebung an …"
  python3 -m venv "$VENV_DIR"
fi

# Pakete installieren
echo "Installiere Python-Pakete …"
"$VENV_DIR/bin/pip" install --upgrade pip --quiet
"$VENV_DIR/bin/pip" install -r "$SCRIPT_DIR/requirements.txt" --quiet

echo ""
echo "=== Installation erfolgreich ==="
echo "Starten mit:  bash $SCRIPT_DIR/start.sh"
echo ""
echo "Optional: Datenverzeichnis setzen (Standard: ../koos-daten)"
echo "  export KOOS_DATA_DIR=/pfad/zu/koos-daten"
