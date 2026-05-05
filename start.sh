#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# KOOS Server – Start-Skript
# Aufruf: bash start.sh  [--prod]
# Mit --prod: kein Auto-Reload, Worker = CPU-Anzahl
# ════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PYTHON="$SCRIPT_DIR/.venv/bin/python"

if [ ! -f "$VENV_PYTHON" ]; then
  echo "Virtuelle Umgebung fehlt. Bitte zuerst install.sh ausführen."
  exit 1
fi

# Standardwerte (können per Umgebungsvariable überschrieben werden)
export KOOS_HOST="${KOOS_HOST:-0.0.0.0}"
export KOOS_PORT="${KOOS_PORT:-8090}"
export KOOS_DATA_DIR="${KOOS_DATA_DIR:-$SCRIPT_DIR/../koos-daten}"

echo "=== KOOS Server ==="
echo "Host:     $KOOS_HOST:$KOOS_PORT"
echo "Daten:    $KOOS_DATA_DIR"
echo "URL:      http://localhost:$KOOS_PORT"
echo "API-Docs: http://localhost:$KOOS_PORT/api/docs"
echo ""

if [[ "${1:-}" == "--prod" ]]; then
  # Produktion: mehrere Worker, kein Reload
  WORKERS=$(python3 -c "import os; print(min(4, (os.cpu_count() or 1) + 1))")
  echo "Modus: Produktion ($WORKERS Worker)"
  exec "$VENV_PYTHON" -m uvicorn main:app \
    --host "$KOOS_HOST" \
    --port "$KOOS_PORT" \
    --workers "$WORKERS" \
    --app-dir "$SCRIPT_DIR"
else
  # Entwicklung: Single-Worker mit Auto-Reload
  echo "Modus: Entwicklung (Auto-Reload aktiv)"
  exec "$VENV_PYTHON" -m uvicorn main:app \
    --host "$KOOS_HOST" \
    --port "$KOOS_PORT" \
    --reload \
    --app-dir "$SCRIPT_DIR"
fi
