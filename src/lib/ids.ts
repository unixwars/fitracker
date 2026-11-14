/**
 * Deterministic id for a row that was typed by hand without one (spec 3.2). It depends only on the tab, the sheet row
 * and the row's content, so two devices that both see the same id-less row write the same value and never disagree.
 */
export function backfillId(tab: string, row: number, parts: (string | number)[]): string {
  const text = [tab, row, ...parts].join('|')
  let a = 0x811c9dc5
  let b = 0x9747b28c
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0
    b = (b ^ (b >>> 13)) >>> 0
  }
  return 'h' + a.toString(36) + b.toString(36)
}
