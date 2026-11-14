# Deploy your own copy

Nothing is shared between deployments: you host a static copy, you bring your own Google OAuth
client, and your data stays in your own Google Sheet.

## 1. Google Cloud (once)

1. Create a project at <https://console.cloud.google.com/>. Note its **project number**.
2. Enable the **Google Sheets API**, the **Google Drive API** (used once, to copy the template) and the **Google Picker API**.
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
VITE_TEMPLATE_COPY_URL=https://docs.google.com/spreadsheets/d/<template id>/copy
```

`VITE_TEMPLATE_COPY_URL` is the public template's copy link. The first-run screen uses it to create each person's own sheet. Leave it empty if you do not publish a template: people then link a sheet they made themselves.

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

1. Open the app. The first-run screen offers **Create your sheet from the template**: pick the template when the
   Google picker opens and the app copies it into your Drive and links the copy. If the picker says "The API
   developer key is invalid", your browser is blocking third-party cookies: allow them for the site and retry.
2. Already have a sheet from the template (see [template.md](template.md))? Choose **I already have a sheet: link
   it** and pick the file.
3. Everyone who should use the sheet shares it in Google Sheets, then chooses **Link it** on their own device and
   account: with `drive.file`, each person must pick the sheet once.
