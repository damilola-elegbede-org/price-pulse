#!/usr/bin/env bash
# Daily price-alert run — decrypts Keepa API key then runs the price-pulse pipeline.
# Called by launchd/bareclaude.price-pulse.daily-alert.plist.
# DB_PATH and TELEGRAM_SEND_SCRIPT must be set by the plist EnvironmentVariables.
set -euo pipefail

REPO_ROOT="/Users/daelegbe/BareClaude"
AGE_KEY="$REPO_ROOT/infra/credentials/age-key.txt"
KEEPA_CRED="$REPO_ROOT/finn/.credentials/keepa-api.age"

# TODO(ENG-254): confirm PIPELINE_JS path once Finn's MVP sprint is merged and
# the full pipeline is available via npm run build in this repo.
PIPELINE_JS="$REPO_ROOT/finn/repos/price-pulse/dist/pipeline.js"

if [[ ! -f "$KEEPA_CRED" ]]; then
  echo "[price-pulse] ERROR: $KEEPA_CRED not found — provision before enabling plist" >&2
  exit 1
fi

if [[ ! -f "$PIPELINE_JS" ]]; then
  echo "[price-pulse] ERROR: $PIPELINE_JS not found — run 'npm run build' in the price-pulse repo" >&2
  exit 1
fi

KEEPA_API_KEY=$(/opt/homebrew/bin/age -d -i "$AGE_KEY" "$KEEPA_CRED" 2>/dev/null)
if [[ -z "$KEEPA_API_KEY" ]]; then
  echo "[price-pulse] ERROR: failed to decrypt $KEEPA_CRED" >&2
  exit 1
fi

# Accepted risk (Nyx FINDING 1 / ENG-571): KEEPA_API_KEY is exported as an env var,
# which is briefly readable by same-UID processes via `ps auxeww` for the duration of
# the node run. Mitigation via stdin injection requires pipeline changes tracked in
# ENG-572 (Finn). Exposure window is short (<30s typical run time).
export KEEPA_API_KEY

exec /opt/homebrew/bin/node "$PIPELINE_JS"
