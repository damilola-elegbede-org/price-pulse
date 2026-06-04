#!/usr/bin/env bash
# Installs bareclaude.price-pulse.daily-alert.plist into ~/Library/LaunchAgents.
# Gated on ENG-254: dist/pipeline.js must exist (run 'npm run build' first).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PLIST_SRC="$REPO_ROOT/launchd/disabled/bareclaude.price-pulse.daily-alert.plist"
PLIST_LABEL="bareclaude.price-pulse.daily-alert"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"
PIPELINE_JS="$REPO_ROOT/dist/pipeline.js"

if [[ ! -f "$PIPELINE_JS" ]]; then
  echo "[install-launchd] ERROR: $PIPELINE_JS not found." >&2
  echo "[install-launchd] Run 'npm run build' first (ENG-254 must be merged)." >&2
  exit 1
fi

ln -sf "$PLIST_SRC" "$PLIST_DEST"
echo "[install-launchd] Symlinked $PLIST_LABEL → $PLIST_DEST"

launchctl bootout "gui/$(id -u)/$PLIST_LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DEST"
echo "[install-launchd] Bootstrapped $PLIST_LABEL"
