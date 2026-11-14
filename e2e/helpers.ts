import type { Page } from '@playwright/test'

export const SHEET = 'fake-sheet'

// The fake sheet is exposed on window by the offline end-to-end mode. Each helper inlines the lookup because the
// function passed to page.evaluate runs in the browser and cannot see anything defined in this file.
type Fake = { book(id: string): { get(r: string): { v: unknown } | undefined; set(r: string, v: unknown): void; clear(r: string): void } }

/** Reads a cell of the in-memory fake sheet. */
export const cell = (page: Page, ref: string) =>
  page.evaluate(([id, r]) => (window as unknown as { __fake: Fake }).__fake.book(id).get(r)?.v ?? null, [SHEET, ref] as const)

export const clearRange = (page: Page, range: string) =>
  page.evaluate(([id, r]) => (window as unknown as { __fake: Fake }).__fake.book(id).clear(r), [SHEET, range] as const)

/** Writes one cell of the fake sheet, as a person editing it in Google Sheets would. */
export const setCell = (page: Page, ref: string, value: unknown) =>
  page.evaluate(([id, r, v]) => (window as unknown as { __fake: Fake }).__fake.book(id).set(r as string, v), [SHEET, ref, value] as const)

/** Makes the app re-read the sheet now (the fake store has no refresh interval): what returning to the tab does. */
export const refresh = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

/** The spreadsheet serial number of today's local date. */
export const todaySerial = (page: Page) =>
  page.evaluate(() => {
    const d = new Date()
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000 + 25569
  })
