<script lang="ts">
  import { niceMax, seriesColor, shortMoney } from '../../charts'
  import { messages } from '../../messages'

  type Series = { name: string; values: number[] }
  let { title, labels, series, stacked = false, line, format }: {
    title: string
    labels: string[]
    series: Series[]
    stacked?: boolean
    line?: { name: string; values: (number | null)[] } // a ratio 0..1 on its own right-hand axis
    format: (minor: number) => string
  } = $props()

  const W = 320, H = 190, L = 34, T = 8, B = 22
  const R = $derived(line ? 30 : 6) // room for the right-hand axis only when there is a line
  const plotW = $derived(W - L - R)
  const plotH = H - T - B
  const clamp = (v: number) => (v > 0 ? v : 0)
  const totals = $derived(labels.map((_, i) => (stacked ? series.reduce((a, s) => a + clamp(s.values[i] ?? 0), 0) : Math.max(0, ...series.map((s) => clamp(s.values[i] ?? 0))))))
  const max = $derived(niceMax(Math.max(0, ...totals)))
  const band = $derived(plotW / Math.max(1, labels.length))
  const barW = $derived(stacked ? band * 0.7 : (band * 0.8) / Math.max(1, series.length))
  const y = (v: number) => T + plotH - (clamp(v) / max) * plotH
  const ticks = $derived([0, 0.5, 1].map((t) => t * max))
  const lineMax = $derived(Math.max(1, ...(line?.values ?? []).map((v) => v ?? 0)))
  const linePoints = $derived((line?.values ?? []).map((v, i) => (v === null ? null : [L + band * (i + 0.5), T + plotH - (Math.max(0, v) / lineMax) * plotH] as [number, number])))
  const lineD = $derived(linePoints.reduce((d, p, i, all) => (p ? `${d}${i === 0 || !all[i - 1] ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)} ` : d), ''))
  let focus = $state<number | null>(null)
  $effect(() => { if (focus !== null && focus >= labels.length) focus = null }) // the data changed under a highlighted bar
  const caption = $derived(focus === null ? '' : `${labels[focus]}: ${series.map((s) => `${s.name} ${format(s.values[focus!] ?? 0)}`).join(', ')}${line && line.values[focus] != null ? `, ${line.name} ${Math.round(line.values[focus]! * 100)}%` : ''}`)
</script>

<figure class="chart" data-testid="chart">
  <figcaption>{title}</figcaption>
  <svg viewBox="0 0 {W} {H}" role="img" aria-label={title}>
    {#each ticks as t (t)}
      <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} class="grid" />
      <text x={L - 4} y={y(t) + 3} text-anchor="end" class="tick">{shortMoney(t)}</text>
    {/each}
    {#each labels as label, i (i)}
      {@const x0 = L + band * i}
      <g role="presentation" onpointerenter={() => (focus = i)} onclick={() => (focus = focus === i ? null : i)} class:focus={focus === i}>
        <rect x={x0} y={T} width={band} height={plotH} fill="transparent" />
        {#if stacked}
          {#each series.reduce<{ v: number; from: number }[]>((acc, s) => [...acc, { v: clamp(s.values[i] ?? 0), from: (acc.at(-1)?.from ?? 0) + (acc.at(-1)?.v ?? 0) }], []) as seg, k (k)}
            <rect x={x0 + band * 0.15} width={barW} y={y(seg.from + seg.v)} height={Math.max(0, y(seg.from) - y(seg.from + seg.v))} fill={seriesColor(k)} />
          {/each}
        {:else}
          {#each series as s, k (k)}
            <rect x={x0 + band * 0.1 + k * barW} width={barW} y={y(s.values[i] ?? 0)} height={Math.max(0, y(0) - y(s.values[i] ?? 0))} fill={seriesColor(k)} />
          {/each}
        {/if}
        <text x={x0 + band / 2} y={H - 8} text-anchor="middle" class="tick">{label}</text>
      </g>
    {/each}
    {#if line}
      <path d={lineD} fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-dasharray="3 2" />
      <text x={W - R + 3} y={T + 8} class="tick">{Math.round(lineMax * 100)}%</text>
    {/if}
  </svg>
  <p class="legend">{#each series as s, k (k)}<span><i style="background: {seriesColor(k)}"></i>{s.name}</span>{/each}{#if line}<span><i class="dash"></i>{line.name}</span>{/if}</p>
  <p class="muted caption" aria-live="polite">{caption}</p>
  <details>
    <summary>{messages.chartTable}</summary>
    <table>
      <thead><tr><th></th>{#each series as s, k (k)}<th>{s.name}</th>{/each}{#if line}<th>{line.name}</th>{/if}</tr></thead>
      <tbody>{#each labels as label, i (i)}<tr><th>{label}</th>{#each series as s, k (k)}<td>{format(s.values[i] ?? 0)}</td>{/each}{#if line}<td>{line.values[i] == null ? '' : Math.round(line.values[i]! * 100) + '%'}</td>{/if}</tr>{/each}</tbody>
    </table>
  </details>
</figure>
