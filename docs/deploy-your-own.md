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

Any static host works. **Cloudflare Pages** and **GitHub Pages** are the simplest. Serve over HTTPS
(required for the service worker and sign-in). `public/_headers` sets the cache headers on
Cloudflare Pages (it is ignored elsewhere): the entry page and service worker revalidate, hashed
files are cached for a year.

### Cloudflare Pages

**Manual upload** (what the reference deployment uses). Build on a machine that has your `.env`, since
the `VITE_*` values are baked into the bundle, then upload `dist/`:

```bash
pnpm build
pnpm dlx wrangler login            # once
pnpm dlx wrangler pages deploy dist --project-name <name> --branch main
```

The first deploy creates the project. Then add your hostname under **Custom domains**, and add
`https://<hostname>` to the OAuth client's *Authorized JavaScript origins* and `https://<hostname>/*`
to the API key's HTTP referrers. To release, rebuild and run the same deploy command.

Run Wrangler through `pnpm dlx`, not as a dependency, and leave pnpm's ignored build scripts
for `esbuild` and `workerd` unapproved: neither is needed to upload static files.

**Git-connected** (optional, builds on every push to `main`). Create the project with *Connect to
Git* instead: framework preset *None*, build command `pnpm build`, output directory `dist`, and
the three `VITE_GOOGLE_*` values as environment variables (public by nature). Set `NODE_VERSION` if the
build asks for it. A Pages project is one kind or the other; a direct-upload project cannot be
switched to Git later, so create a new project to change.

The OAuth *client secret* is never used by this app (sign-in runs in the browser with the client
ID only). Do not put it in `.env` or in Cloudflare's variables.

## 4. First run

1. Open the app. The first-run screen offers **Create your sheet from the template**: pick the template when the
   Google picker opens and the app copies it into your Drive and links the copy. If the picker says "The API
   developer key is invalid", your browser is blocking third-party cookies: allow them for the site and retry.
2. Already have a sheet from the template (see [template.md](template.md))? Choose **I already have a sheet: link
   it** and pick the file.
3. Everyone who should use the sheet shares it in Google Sheets, then chooses **Link it** on their own device and
   account: with `drive.file`, each person must pick the sheet once.
