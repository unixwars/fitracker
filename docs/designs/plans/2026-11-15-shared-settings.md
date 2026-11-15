# Plan: shared settings (spec 2026-11-15-shared-settings)

One commit per task, tests first.
1. AGENTS.md amendment (done).
2. `overrides.ts` + tests (keys, parse, apply, emoji validation).
3. `SheetsApi.listMetadata` (real client, fake, types) + tests.
4. Ledger store: overrides in `Data`, `overrides()`, `setOverride()` + tests (cached, cleared by `''`, refreshed, no extra write on read).
5. App state: overrides in cache and `lists`, `setAccountToggle`, `setIcon`, failure message + tests.
6. Settings UI, icon rendering through `app` lookups, messages.
7. Docs, CHANGELOG `[Unreleased]`; types, lint, unit tests, Playwright.
