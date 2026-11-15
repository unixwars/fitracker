<script lang="ts">
  import { arcPath, donutSlices, seriesColor } from '../../charts'
  import { messages } from '../../messages'

  let { title, labels, values, format }: { title: string; labels: string[]; values: number[]; format: (minor: number) => string } = $props()
  const slices = $derived(donutSlices(values))
  const total = $derived(values.reduce((a, v) => a + (v > 0 ? v : 0), 0))
  let focus = $state<number | null>(null)
</script>

<figure class="chart" data-testid="chart">
  <figcaption>{title}</figcaption>
  {#if slices.length}
    <svg viewBox="0 0 120 120" role="img" aria-label={title} class="donut">
      {#each slices as s (s.index)}
        <path d={arcPath(60, 60, 54, 30, s.start, s.end)} fill={seriesColor(s.index)} role="presentation" onpointerenter={() => (focus = s.index)} onclick={() => (focus = focus === s.index ? null : s.index)} />
      {/each}
      <text x="60" y="64" text-anchor="middle" class="tick">{focus === null ? '' : `${Math.round((values[focus] / total) * 100)}%`}</text>
    </svg>
    <p class="legend">{#each slices as s (s.index)}<span><i style="background: {seriesColor(s.index)}"></i>{labels[s.index]}</span>{/each}</p>
    <p class="muted caption" aria-live="polite">{focus === null ? '' : `${labels[focus]}: ${format(values[focus])}`}</p>
    <details>
      <summary>{messages.chartTable}</summary>
      <table><tbody>{#each slices as s (s.index)}<tr><th>{labels[s.index]}</th><td>{format(values[s.index])}</td><td>{Math.round(s.fraction * 100)}%</td></tr>{/each}</tbody></table>
    </details>
  {:else}<p class="muted">{messages.noChartData}</p>{/if}
</figure>
