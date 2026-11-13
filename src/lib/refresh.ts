/** How long a read stays fresh: 15 s for a small ledger, growing 5 ms per row (a 10k-row ledger is 65 s), at most 2 min. */
export function refreshInterval(rowCount: number): number {
  return Math.min(120_000, Math.max(15_000, 15_000 + 5 * rowCount))
}
