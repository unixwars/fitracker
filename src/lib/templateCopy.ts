/** The file id inside a Google Sheets URL (`.../spreadsheets/d/<id>/...`), or null when it is not one. */
export function templateFileId(copyUrl: string): string | null {
  return /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/.exec(copyUrl.trim())?.[1] ?? null
}

/** Public template copy link; empty in a fork that does not set VITE_TEMPLATE_COPY_URL. */
export const TEMPLATE_COPY_URL: string = import.meta.env.VITE_TEMPLATE_COPY_URL ?? ''
