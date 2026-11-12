# Deploy your own copy

Nothing is shared between deployments: you host a static copy, you bring your own Google OAuth
client, and your data stays in your own Google Sheets.

## 1. Google Cloud (once)

1. Create a project at <https://console.cloud.google.com/>. Note its **project number**.
2. Enable the **Google Sheets API** and the **Google Picker API**.
3. Configure the OAuth consent screen. The only scope used is `drive.file` (non-sensitive), so no
   Google verification is needed; set the publishing status to *In production* so sign-ins do not
   expire after 7 days.
4. Create an **OAuth client ID** of type *Web application*. Add your site's origin (and
   `http://localhost:5173` for development) under *Authorized JavaScript origins*.
5. Create an **API key** and restrict it: *Application restrictions: HTTP referrers* (your site
   and localhost) and *API restrictions: Google Picker API*. The key ships in the page, so the
   restrictions are what protect it.

## 2. Configure

Copy `.env.example` to `.env` and fill in:

```
VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
VITE_GOOGLE_API_KEY=...
VITE_GOOGLE_PROJECT_NUMBER=...
```

`.env` is ignored by git. Never commit real values.

## 3. Build and host

```bash
pnpm install
pnpm build            # output in dist/
```

Any static host works. **GitHub Pages** is the simplest default; for a project site under
`/<repo>/` build with `VITE_BASE=/<repo>/ pnpm build`. Serve over HTTPS (required for the service
worker and sign-in).

## 4. First run

1. Make a copy of the template (see [template.md](template.md)) and convert it to a Google Sheet.
2. Open the app, **Settings**, choose the year, **Link the sheet**, pick the file.
3. If the app asks for a one-time update, read what it will do and run it. Backup tabs are made first.
4. Everyone who should use the sheet shares it in Google Sheets, then repeats step 2 on their own
   device and account: with `drive.file`, each person must pick each year's sheet once.
