# Contributing

## Dev setup

```bash
node --version   # requires >=22
npm install
```

Copy `.env.example` (or create a `.env`) with the three required variables:

```ini
KEEPA_API_KEY=your_key_here
ASIN=B001E4KFG0
TELEGRAM_SEND_SCRIPT=/path/to/telegram-send.sh
```

## Development workflow

```bash
npm run typecheck   # type-check without emitting (fast, use often)
npm test            # Jest suite via ts-jest
npm run build       # compile to dist/
```

All three must be green before opening a PR. CI runs the same checks on every push.

## Code conventions

- **TypeScript strict mode.** No `any`, no `as` casts without a comment explaining why.
- **Monetary values in cents throughout.** Divide by 100 only at display time — see `docs/architecture.md`.
- **No third-party runtime deps.** The pipeline uses only Node built-ins and Keepa's REST API. Keep it that way unless there's a compelling reason to add a dependency.
- **Tests alongside source.** Each module ships its own `.test.ts` at the same path.
- **No secrets in source.** Use environment variables. Never commit `.env`.

## Pull request process

1. Branch from `main` using the `eng-<issue>-<slug>` convention (e.g. `eng-254-sqlite-storage`).
2. Keep PRs scoped to a single Linear issue.
3. Run `npm run typecheck && npm test` locally before pushing.
4. Reference the Linear issue in the PR body: `Closes ENG-XXX`.
5. CI must be green before requesting review.
6. PRs are merged by the project maintainer — do not self-merge.

## Reporting issues

File a Linear issue in the ENG team. Include: expected behavior, actual behavior, reproduction steps, and Node version (`node --version`).
