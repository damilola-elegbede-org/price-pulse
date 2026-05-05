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
