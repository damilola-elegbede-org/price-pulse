# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **SQLite storage layer** (`src/db.ts`): `openDb`, `upsertAsin`, `listAsins`, `insertPricePoint`, `get7dAvgCents`, `wasAlertedRecently`, `recordAlert`. Schema: `asins`, `price_history`, `alerts` tables with WAL mode.
- **Multi-ASIN alert pipeline** (`src/pipeline.ts`): `runAll(db)` iterates all tracked ASINs from the database; `run(asin, thresholdCents, db)` fetches Keepa history, stores the latest price point, evaluates price against the per-ASIN `threshold_cents` configured via the REST API, and fires a Telegram alert when the current price falls below that threshold (24h dedup). The 7-day rolling average is computed for display context in the alert message but does not drive the alert decision.
- **REST endpoint** (`src/server.ts`): `POST /api/v1/price-alerts` registers or updates an ASIN with `{ asin, name, threshold_cents }`. Returns `200 { ok, asin }` on success, `400` on validation errors, `404` for unknown routes.
- **launchd cron** (`launchd/bareclaude.price-pulse.poll.plist`): daily pipeline run at 07:00 MT via `dist/pipeline.js`. `DB_PATH` and `TELEGRAM_SEND_SCRIPT` set in plist environment.
- Keepa fetch-failure alerting in the daily pipeline: errors send a generic Telegram alert
  (`price-pulse: Keepa fetch failed — see pipeline logs`) and exit with code 1. Full error
  detail is written to stderr only. `TELEGRAM_SEND_SCRIPT` is required in CLI mode (the
  pipeline exits early if unset or the script is not executable).
