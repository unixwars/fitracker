<script lang="ts">
  import { groupByDay } from '../byDay'
  import { messages } from '../messages'
  import CategoryIcon from './CategoryIcon.svelte'
  import type { Entry } from '../rows'
  import { dateLabel, fmt } from './format'

  let { entries, month, onedit }: { entries: Entry[]; month: string; onedit: (e: Entry) => void } = $props()
  const days = $derived(groupByDay(entries, month))
  const text = (e: Entry) => (e.kind === 'transfer' ? messages.transferRow(e.account ?? '', e.toAccount ?? '') : e.place || e.description || '—')
  const detail = (e: Entry) => (e.kind === 'transfer' ? e.description : [e.category, e.account].filter(Boolean).join(' · '))
</script>

{#each days as d (d.date)}
  <section class="card" data-testid="day">
    <h3>{dateLabel(d.date)}</h3>
    {#each d.entries as e (e.id)}
      <button class="entry" onclick={() => onedit(e)}>
        <span>{#if e.category}<CategoryIcon name={e.category} />{/if}{text(e)}{#if detail(e)}<small class="muted"> · {detail(e)}</small>{/if}</span>
        <b class="amt">{fmt(e.money)}<svg class="pen" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></b>
      </button>
    {/each}
  </section>
{:else}
  <p class="muted">{messages.noEntries}</p>
{/each}
