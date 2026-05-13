# price-pulse

Track Amazon coffee bean prices over time using the Keepa API.

## Purpose

Price Pulse ingests historical and real-time price data from Amazon (via Keepa) for a curated set of coffee ASINs, stores it, and surfaces trends. It's a portfolio-quality, end-to-end TypeScript project built and shipped by Finn in the BareClaude fleet.

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 22 |
| Language | TypeScript 5 (strict mode) |
| Data source | Keepa API (ENG-265) |
| Test runner | Jest + ts-jest |
| CI | GitHub Actions |

## Running the Pipeline

Build the project first, then invoke with the target ASIN:

```bash
npm run build
ASIN=B001E4KFG0 node dist/pipeline.js
```

**Exit codes**

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Keepa fetch failure, unexpected error, or missing `ASIN` |

**Expected output on success**

```
Fetched N price points for ASIN B001E4KFG0
```

## Configuration

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ASIN` | Yes (CLI mode) | — | Amazon product ASIN to fetch pricing history for |
| `TELEGRAM_SEND_SCRIPT` | Yes (CLI mode) | — | Path to the Telegram send script used for fetch-failure alerts |

> **Note:** `TELEGRAM_SEND_SCRIPT` is required when running the pipeline in CLI mode. The pipeline exits with code 1 if it is unset or the script is not executable. The script must accept a `--raw <message>` argument. Error detail is written to stderr (not included in the Telegram message).

## Local Development

**Prerequisites:** Node.js 22+

```bash
npm install
npm run typecheck   # type-check without emitting
npm test            # run Jest test suite
npm run build       # compile to dist/
```

## Project Status

- [x] Repo scaffold (ENG-295)
- [ ] Keepa ingestion pipeline (ENG-265)
- [ ] MVP sprint (ENG-254)

## License

MIT
