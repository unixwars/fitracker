# Live check

A throwaway browser page that runs the app's real `EntryStore` and Sheets adapter against the real Google Sheets API, on a copy of the public template. It covers what the fake sheet cannot: where rows really land, `growTab` on a full grid, month-roll formulas, simultaneous writers, sort/delete in Sheets and the unreadable-row cases. Run it before a release that touches `src/lib/sheets/`, `schema.ts` or the template.

## Run
1. `cd docs/designs/spikes/live-check && pnpm exec vite build` (writes `dist/`, git-ignored).
2. Stop `pnpm dev` (the OAuth client only allows `http://localhost:5173`), then `python3 -m http.server 5173` in this folder and open `http://localhost:5173/live-check.html`.
3. Use a private window with third-party cookies allowed (the Picker needs them), signed in as an account that does **not** own the template. Paste your OAuth client ID, sign in, pick the public template in the Picker and let it run.
4. Pass: the last line reads `N passed, 0 failed` and nothing printed `ERROR`.

It copies the template to a file called "Fitracker LIVE CHECK (delete me)" in the signed-in account's Drive; delete it afterwards. It never touches any other sheet, and holds no keys or data.
