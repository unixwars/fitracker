<script lang="ts">
  import { groupByDay } from '../byDay'
  import { messages } from '../messages'
  import type { Entry } from '../rows'
  import { dateLabel, fmt } from './format'

  let { entries, month, onedit }: { entries: Entry[]; month: string; onedit: (e: Entry) => void } = $props()
  const days = $derived(groupByDay(entries, month))
  const text = (e: Entry) => (e.kind === 'transfer' ? `${e.account ?? ''} → ${e.toAccount ?? ''}` : e.place || e.description || e.category || '—')
  const detail = (e: Entry) => (e.kind === 'transfer' ? e.description : [e.category, e.account].filter(Boolean).join(' · '))
</script>

{#each days as d (d.date)}
  <section class="card" data-testid="day">
    <h3>{dateLabel(d.date)}</h3>
    {#each d.entries as e (e.id)}
      <button class="entry" onclick={() => onedit(e)}>
        <span>{text(e)}{#if detail(e)}<small class="muted"> · {detail(e)}</small>{/if}</span>
        <b class="amt">{fmt(e.money)}</b>
      </button>
    {/each}
  </section>
{:else}
  <p class="muted">{messages.noEntries}</p>
{/each}
