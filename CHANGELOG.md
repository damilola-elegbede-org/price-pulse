# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Keepa fetch-failure alerting in the daily pipeline: errors send a generic Telegram alert
  (`price-pulse: Keepa fetch failed — see pipeline logs`) and exit with code 1. Full error
  detail is written to stderr only. `TELEGRAM_SEND_SCRIPT` is required in CLI mode (the
  pipeline exits early if unset or the script is not executable).
