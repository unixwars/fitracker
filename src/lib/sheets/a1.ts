export type Rect = { sheet: string; c1: number; r1: number; c2: number; r2: number }

export function colToNum(letters: string): number {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

export function numToCol(n: number): string {
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// 'Tab!A1', 'Tab!A1:C5', "'My tab'!A1:B2"
export function parseRange(range: string): Rect {
  const bang = range.lastIndexOf('!')
  const rawSheet = range.slice(0, bang)
  const sheet = rawSheet.startsWith("'") ? rawSheet.slice(1, -1).replace(/''/g, "'") : rawSheet
  const [a, b = a] = range.slice(bang + 1).split(':')
  // The second cell may omit its row ("C10:C"): the range then runs to the bottom of the sheet.
  const cell = (s: string, needRow: boolean) => {
    const m = /^([A-Z]+)(\d*)$/.exec(s)
    if (!m || (needRow && !m[2])) throw new Error(`Unsupported range: ${range}`)
    return { c: colToNum(m[1]), r: m[2] ? Number(m[2]) : Infinity }
  }
  const p = cell(a, true)
  const q = cell(b, false)
  return { sheet, c1: Math.min(p.c, q.c), r1: Math.min(p.r, q.r), c2: Math.max(p.c, q.c), r2: Math.max(p.r, q.r) }
}

export const quoteSheet = (name: string): string => (/^[A-Za-z0-9_]+$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`)
