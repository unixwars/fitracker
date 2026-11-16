// Pure helpers for the hand-drawn SVG charts; the components only render what these return.

const PALETTE = ['#2f6fdb', '#e07a1f', '#2a9d8f', '#c2410c', '#7c5cc4', '#d4a017', '#4d7c0f', '#be185d', '#0e7490', '#6b7280', '#9a3412', '#3f6212']
export const seriesColor = (i: number): string => PALETTE[i % PALETTE.length]

/** A round axis maximum at or above `v` (1, 2, 2.5 or 5 times a power of ten). */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p
  return 10 * p
}

/** Minor units as a short axis label in major units: 1.2k, -2.5k, 50. */
export function shortMoney(minor: number): string {
  const v = minor / 100
  const a = Math.abs(v)
  if (a >= 1000) return `${Math.round(v / 100) / 10}k`
  return String(Math.round(v))
}

export type Slice = { index: number; fraction: number; start: number; end: number }
/** Positive values as consecutive slices of one turn (0 to 1). */
export function donutSlices(values: number[]): Slice[] {
  const total = values.reduce((a, v) => a + (v > 0 ? v : 0), 0)
  if (total <= 0) return []
  let at = 0
  const out: Slice[] = []
  values.forEach((v, index) => {
    if (!(v > 0)) return
    const fraction = v / total
    out.push({ index, fraction, start: at, end: at + fraction })
    at += fraction
  })
  return out
}

const point = (cx: number, cy: number, r: number, turn: number) => [cx + r * Math.sin(turn * 2 * Math.PI), cy - r * Math.cos(turn * 2 * Math.PI)]
const f = (n: number) => n.toFixed(2)

/** A ring segment from turn `a0` to `a1` (0 to 1, clockwise from the top) between radii `r0` and `r`. */
export function arcPath(cx: number, cy: number, r: number, r0: number, a0: number, a1: number): string {
  if (a1 - a0 >= 0.9999) {
    const half = arcPath(cx, cy, r, r0, a0, a0 + 0.5)
    return `${half} ${arcPath(cx, cy, r, r0, a0 + 0.5, a0 + 1)}`
  }
  const large = a1 - a0 > 0.5 ? 1 : 0
  const [x0, y0] = point(cx, cy, r, a0)
  const [x1, y1] = point(cx, cy, r, a1)
  const [x2, y2] = point(cx, cy, r0, a1)
  const [x3, y3] = point(cx, cy, r0, a0)
  return `M${f(x0)} ${f(y0)} A${r} ${r} 0 ${large} 1 ${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} A${r0} ${r0} 0 ${large} 0 ${f(x3)} ${f(y3)} Z`
}
