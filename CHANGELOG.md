# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **SQLite storage layer** (`src/db.ts`): `openDb`, `upsertAsin`, `listAsins`, `insertPricePoint`, `get7dAvgCents`, `wasAlertedRecently`, `recordAlert`. Schema: `asins`, `price_history`, `alerts` tables with WAL mode.
- **Multi-ASIN alert pipeline** (`src/pipeline.ts`): `runAll(db)` iterates all tracked ASINs from the database; `run(asin, db, thresholdCents)` fetches Keepa history, stores the latest price point, evaluates price against the per-ASIN `threshold_cents` configured via the REST API, and fires a Telegram alert when the current price falls below that threshold (24h dedup). The 7-day rolling average is computed for display context in the alert message but does not drive the alert decision.
- **REST endpoint** (`src/server.ts`, `src/server-main.ts`): `POST /api/v1/price-alerts` registers or updates an ASIN with `{ asin, name, threshold_cents }`. Requires `Authorization: Bearer <PRICE_PULSE_API_TOKEN>`; all requests rejected with `401` if the env var is unset (fail-secure). Request body capped at 64 KB. ASIN validated as exactly 10 uppercase alphanumeric characters; name capped at 512 characters. The production entrypoint binds to `127.0.0.1` and validates both `PRICE_PULSE_API_TOKEN` and `DB_PATH` at startup.
- **launchd cron** (`launchd/bareclaude.price-pulse.poll.plist`): daily pipeline run at 07:00 MT. Invokes `finn/scripts/price-pulse-run.sh`, which decrypts `KEEPA_API_KEY` from `finn/.credentials/keepa-api.age` (fleet-standard age vault) before exec'ing `dist/pipeline.js`. `DB_PATH` points to `finn/.state/price-pulse.db` (outside the working tree). `TELEGRAM_SEND_SCRIPT` path is validated against the BareClaude root at startup.
- Keepa fetch-failure alerting in the daily pipeline: errors send a generic Telegram alert
  (`price-pulse: Keepa fetch failed — see pipeline logs`) and exit with code 1. Full error
  detail is written to stderr only. `TELEGRAM_SEND_SCRIPT` is required in CLI mode (the
  pipeline exits early if unset or the script is not executable).
