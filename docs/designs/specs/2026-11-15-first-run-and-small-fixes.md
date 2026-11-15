# First-run screen, Picker hint, Install button, Place refill fix (issues #15, #13 minimum, #6, #11)

Branch `feat/first-run-and-fixes`, PR into `dev`, ships as 0.2.1. Plan: `docs/designs/plans/2026-11-15-first-run-and-small-fixes.md`.

## Why
Friends will open the app from a link. Within a few seconds they should understand that it tracks **expenses, budgets and net worth**, and that **all data lives in a standard Google Sheet they control**, and they should know what to tap. Today the first screen says only "Set up your sheet".

## Goals / non-goals
- Goals: a friend taps "Create my sheet" without reading more than two lines; no dead end when the Google Picker fails; the install and project links are findable.
- Non-goals: dropping the Picker or adding a backend (#13 "beyond that" stays open); a tour or onboarding wizard; any new dependency.
- Anti-goal: a long screen that pushes the primary button below the fold on a phone.

## Approaches (first-run, #15)
- **A. Dialog over the screen.** Rejected: when no sheet is linked the first-run screen is already the whole app, so a dialog sits on top of the only content, adds modal state and a "seen" setting, and leaves the same cryptic screen behind once dismissed.
- **B. Richer first-run screen (chosen, with the user).** Pitch, three tiles, then buttons; steps and help folded. One screen, no modal state.
- Layout chosen after mockups A/B/C: **B+C**, a short lazy hero strip, three tiles, a "your data lives in a Google Sheet you own" line, then the two buttons. "How it works" (3 steps) and "Trouble linking?" are folded `<details>`. GitHub and Releases links at the bottom.

## Design
- Intro (hero, tiles, pitch) shows only when **signed out and unlinked**. Signed in but unlinked (for example after unlinking, or after one failed link: `link()` and `createFromTemplate()` set `signedIn` before the Picker opens) gets the title and the two buttons, so the screen stays short. The "Trouble linking?" fold and the GitHub/Releases links are **outside the intro** and always shown while unlinked. `showIntro(status, signedIn)` is a pure function in `src/lib/welcome.ts`.
- Hero: one file, `public/hero.webp` (`pnpm hero` writes it there; the README points at it, so there is no second copy). It is a plain static file: the precache glob (`js,css,html,svg,png`) does not match `.webp`, so it is neither bundled nor precached, and the browser fetches it only when the first-run screen renders it (`src` built from `import.meta.env.BASE_URL` so `VITE_BASE` sub-paths work; `width`/`height` and `decoding="async"`, no `loading="lazy"` (it is above the fold and only in the DOM when the screen shows, so lazy only delays it); fixed-height strip with a background colour so nothing shifts, `object-fit` checked so the crop keeps the phone, and offline before first sight just shows the strip). Not hosted on a third party (privacy, forks). Compare build output and Lighthouse before and after; drop the image if either gets worse.
- Primary button at least 44px tall and above the fold at 360x640; checked in Playwright.
- **#13 minimum:** the "Trouble linking?" fold explains third-party cookies with a per-browser how-to (Chrome Android, Chrome desktop, Safari/iOS, Firefox). The hint also shows after a **cancelled** Picker (a cookie failure is shown inside Google's iframe and closing it resolves `null`, so `linkFailed` is never set) and with `copyFailed`. No detection: the Picker error is inside Google's iframe and gives no callback. Cost: users with working cookies can also open it.
- **#6:** (see Install reachability) `src/lib/install.ts` is a small pure function over `beforeinstallprompt`, `appinstalled`, iOS and standalone. The listener is attached **synchronously at the top of `main.ts`** (before `await auth.restore()`/`makeEnv()`, or Chrome's early event is lost), calls `preventDefault()`, keeps the event, and drops it after `prompt()` or `appinstalled`. Standalone: `matchMedia('(display-mode: standalone)')` or `navigator.standalone`; iOS detection also covers iPadOS reporting as Mac. Settings shows an "Install app" button while available, and a one-line "Share, then Add to Home Screen" hint on iOS Safari when not standalone. No first-run nudge, so no dismissal state.
- **#15 links:** one `PROJECT_URL` constant; GitHub and Releases links on the first-run screen, and a Releases link in Settings next to the app version.
- **#11:** `shouldAutoLocate` in `places.ts` gains an `alreadyTried` input. In `EntryForm`, `alreadyTried` is a plain `let` (not `$state`, or the effect tracks it), set after the first lookup and cleared in `submit()` right after `onsubmit` (the parent resets the form through `bind:form`, so EntryForm cannot see the reset otherwise). A quiet GPS fill applies only if `form.place` is still empty when the position arrives (it can take up to 8 s). Auto-locate is off when editing an existing entry (`EntrySheet` reuses `EntryForm`). `coords` is cleared with the flag.
- All text in `messages.ts`, English only. Links use `rel="noopener" target="_blank"`.

## Install reachability (decided)
Settings has no tab while unlinked, and on iOS the home-screen app has its own storage, so a friend who links in Safari and then installs would have to sign in and link again. Decision (user): the first-run screen also shows the iOS "Share, then Add to Home Screen" hint (and the Install button where `beforeinstallprompt` is available), folded with the other help, so the friend installs first and links inside the installed app.

## Also
Update the existing cookie line in `docs/corner-cases.md` and checklist item 22 instead of duplicating them. CHANGELOG `[Unreleased]` entry; the version bump waits for the PR to `main`. Manifest `description` (vite.config.ts) is updated to match the new pitch. No translation files exist.

## Left to the builder
Exact copy, tile icons, strip height, and the per-browser how-to wording.

## Checks that need a person
Android Chrome with third-party cookies blocked (hint visible, following it makes the Picker work); install prompt on Android; iOS hint on an iPhone; first-run screen on a fresh profile at phone width.
