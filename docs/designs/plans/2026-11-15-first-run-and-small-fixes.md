# Plan: first-run screen, Picker hint, Install button, Place refill fix

Spec: `docs/designs/specs/2026-11-15-first-run-and-small-fixes.md`. Test first, one commit per task.

1. **#11** Failing unit test for `shouldAutoLocate(..., alreadyTried)`, then the fix in `EntryForm.svelte` (plain `let` flag cleared in `submit()`; late GPS result ignored if the place is no longer empty; off when editing). Playwright: place fills once, clearing leaves it empty, typing works, a place typed before GPS resolves is kept, editing an old entry is not auto-filled.
2. **#15 links** `PROJECT_URL`, Releases link in Settings, messages.
3. **#15 first-run screen** `welcome.ts` + test (`showIntro`), rebuilt `FirstRunScreen.svelte` (hero strip, tiles, pitch, buttons, folded steps, links), `scripts/make-hero.mjs` and README repointed to `public/hero.webp` (not precached). Playwright: intro only when signed out and unlinked; first button above the fold at 360x560 (whichever button comes first; the primary one is missing on forks without a template URL), with its own viewport as `playwright.config.ts` uses 390x844. Keep the existing test ids. Note build size and Lighthouse before and after.
4. **#13 minimum** Cookie how-to messages, "Trouble linking?" fold outside the intro, shown also after a cancelled Picker and with `copyFailed`; update the existing `docs/corner-cases.md` line, README line and checklist item 22.
5. **#6** `install.ts` + test, listener at the top of `main.ts` handed to `AppState`; Playwright dispatches a synthetic `beforeinstallprompt`;, Install button and iOS hint in Settings and, folded, on the first-run screen (user decision), messages.
6. CHANGELOG `[Unreleased]`, manifest description, then types, lint, unit tests, Playwright.
7. One independent Opus review of the branch; fix findings test-first; give the user the manual checklist; open the PR into `dev` only after the user confirms.
