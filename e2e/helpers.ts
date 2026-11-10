import type { Page } from '@playwright/test'

export const SHEET = 'fake-sheet'

/** Reads a cell of the in-memory fake sheet exposed by the offline end-to-end mode. */
export const cell = (page: Page, ref: string) =>
  page.evaluate(([id, r]) => {
    const fake = (window as unknown as { __fake: { book(id: string): { get(r: string): { v: unknown } | undefined } } }).__fake
    return fake.book(id).get(r)?.v ?? null
  }, [SHEET, ref] as const)

export const clearRange = (page: Page, range: string) =>
  page.evaluate(([id, r]) => {
    const fake = (window as unknown as { __fake: { book(id: string): { clear(r: string): void } } }).__fake
    fake.book(id).clear(r)
  }, [SHEET, range] as const)
