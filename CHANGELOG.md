# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Keepa fetch-failure alerting in the daily pipeline: errors send a Telegram alert
  (prefixed `price-pulse:`, truncated to 120 chars) and exit the pipeline with code 1.
  Configure alert delivery via `TELEGRAM_SEND_SCRIPT` env var.
