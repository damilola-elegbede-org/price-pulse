# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Keepa fetch-failure alerting in the daily pipeline: errors send a generic Telegram alert
  (`price-pulse: Keepa fetch failed — see pipeline logs`) and exit with code 1. Full error
  detail is written to stderr only. `TELEGRAM_SEND_SCRIPT` is required in CLI mode (the
  pipeline exits early if unset or the script is not executable).
- Added daily launchd plist (`launchd/bareclaude.price-pulse.daily-alert.plist`) and
  `scripts/price-alert-run.sh` wrapper for automated cron execution at 09:00 MT.
  Decrypts `KEEPA_API_KEY` from `finn/.credentials/keepa-api.age` at runtime — no `.env`
  required in cron mode. (ENG-571)
