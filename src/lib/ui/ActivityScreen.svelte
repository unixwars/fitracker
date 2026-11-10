<script lang="ts">
  import type { AppState } from '../app.svelte'
  import { messages } from '../messages'
  import { dateLabel, fmt } from './format'

  let { app }: { app: AppState } = $props()
  const recent = $derived([...app.ops].filter((o) => o.status === 'done').reverse().slice(0, 30))
  const waiting = $derived(app.ops.filter((o) => o.status === 'pending'))
</script>

<h2 style="margin: 4px 0 12px">{messages.activityTitle}</h2>

<section class="card" data-testid="attention">
  <h3>{messages.needsAttention}</h3>
  {#each app.attention as op (op.opId)}
    <div style="margin-bottom: 12px">
      <b>{messages.ops[op.type]}: {op.entry ? `${op.entry.description || op.entry.place || op.entry.category || ''} ${fmt(op.entry.money)}` : op.entryId}</b>
      <p class="muted">{messages.reasons[op.reason ?? 'Other']}</p>
      <div class="row">
        <button class="secondary" onclick={() => app.discard(op)}>{messages.discard}</button>
        {#if op.type !== 'delete'}<button class="secondary" disabled={!app.canWrite} onclick={() => app.readd(op)}>{messages.readd}</button>{/if}
      </div>
    </div>
  {:else}<p class="muted">{messages.nothingToReview}</p>{/each}
</section>

{#if waiting.length}
  <section class="card">
    <h3>{messages.pending}</h3>
    {#each waiting as op (op.opId)}
      <div class="stat"><span>{messages.ops[op.type]} · {op.entry?.description || op.entry?.place || op.entry?.category || ''}</span><span>{op.entry ? fmt(op.entry.money) : ''}</span></div>
    {/each}
  </section>
{/if}

<section class="card">
  <h3>{messages.recentChanges}</h3>
  {#each recent as op (op.opId)}
    <div class="stat">
      <span>{messages.ops[op.type]} · {op.entry ? dateLabel(op.entry.date) : ''} {op.entry?.description || op.entry?.place || ''}</span>
      {#if op.undone}<span class="muted">{messages.undone}</span>
      {:else if op.type !== 'add' || op.entry}<button class="secondary" disabled={!app.canWrite} onclick={() => app.undoOp(op)} data-testid="undo">{messages.undo}</button>{/if}
    </div>
  {:else}<p class="muted">{messages.noChanges}</p>{/each}
</section>
