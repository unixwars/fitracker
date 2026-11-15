<script lang="ts">
  import { niceMax, seriesColor, shortMoney } from '../../charts'
  import { messages } from '../../messages'

  let { title, labels, series, format }: { title: string; labels: string[]; series: { name: string; values: (number | null)[] }[]; format: (minor: number) => string } = $props()
  const W = 320, H = 190, L = 34, R = 6, T = 8, B = 22
  const plotW = W - L - R, plotH = H - T - B
  const clamp = (v: number | null) => (v !== null && v > 0 ? v : 0)
  const last = $derived(labels.reduce((m, _, i) => (series.some((s) => s.values[i] !== null) ? i : m), -1)) // months with no value at all are not drawn
  const stack = $derived(labels.map((_, i) => series.reduce<number[]>((acc, s) => [...acc, (acc.at(-1) ?? 0) + clamp(s.values[i])], [0])))
  const max = $derived(niceMax(Math.max(0, ...stack.map((c) => c.at(-1) ?? 0))))
  const x = (i: number) => L + (labels.length > 1 ? (plotW * i) / (labels.length - 1) : plotW / 2)
  const y = (v: number) => T + plotH - (v / max) * plotH
  const area = (k: number) => {
    if (last < 0) return ''
    const idx = Array.from({ length: last + 1 }, (_, i) => i)
    const top = idx.map((i) => `${x(i).toFixed(1)} ${y(stack[i][k + 1]).toFixed(1)}`)
    const bottom = idx.reverse().map((i) => `${x(i).toFixed(1)} ${y(stack[i][k]).toFixed(1)}`)
    return `M${top.join(' L')} L${bottom.join(' L')} Z`
  }
  const ticks = $derived([0, 0.5, 1].map((t) => t * max))
</script>

<figure class="chart" data-testid="chart">
  <figcaption>{title}</figcaption>
  {#if last >= 0}
    <svg viewBox="0 0 {W} {H}" role="img" aria-label={title}>
      {#each ticks as t (t)}
        <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} class="grid" />
        <text x={L - 4} y={y(t) + 3} text-anchor="end" class="tick">{shortMoney(t)}</text>
      {/each}
      {#each series as s, k (s.name)}<path d={area(k)} fill={seriesColor(k)} fill-opacity="0.85" />{/each}
      {#each labels as label, i (i)}<text x={x(i)} y={H - 8} text-anchor="middle" class="tick">{label}</text>{/each}
    </svg>
    <p class="legend">{#each series as s, k (s.name)}<span><i style="background: {seriesColor(k)}"></i>{s.name}</span>{/each}</p>
    <details>
      <summary>{messages.chartTable}</summary>
      <table>
        <thead><tr><th></th>{#each series as s (s.name)}<th>{s.name}</th>{/each}</tr></thead>
        <tbody>{#each labels as label, i (i)}<tr><th>{label}</th>{#each series as s (s.name)}<td>{s.values[i] === null ? '' : format(s.values[i]!)}</td>{/each}</tr>{/each}</tbody>
      </table>
    </details>
  {:else}<p class="muted">{messages.noChartData}</p>{/if}
</figure>
