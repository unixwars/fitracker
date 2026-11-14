<script lang="ts">
  import type { AppState } from '../app.svelte'
  import { messages } from '../messages'
  import type { Op } from '../outbox'
  import { dateLabel, fmt } from './format'

  let { app }: { app: AppState } = $props()
  const recent = $derived([...app.ops].filter((o) => o.status === 'done').reverse().slice(0, 30))
  const waiting = $derived(app.ops.filter((o) => o.status === 'pending'))
  const opName = (op: Op) => (op.subject === 'snapshot' ? messages.snapshotOps[op.type as 'add' | 'delete'] : messages.ops[op.type])
  const opText = (op: Op) =>
    op.subject === 'snapshot'
      ? op.snapshot ? `${op.snapshot.account} ${fmt(op.snapshot.balance)}` : op.entryId
      : op.entry ? `${op.entry.description || op.entry.place || op.entry.category || ''} ${fmt(op.entry.money)}` : op.entryId
</script>

<h2 style="margin: 4px 0 12px">{messages.activityTitle}</h2>

<section class="card" data-testid="attention">
  <h3>{messages.needsAttention}</h3>
  {#each app.attention as op (op.opId)}
    <div style="margin-bottom: 12px">
      <b>{opName(op)}: {opText(op)}</b>
      <p class="muted">{messages.reasons[op.reason ?? 'Other']}</p>
      <div class="row">
        <button class="secondary" onclick={() => app.discard(op)}>{messages.discard}</button>
        {#if op.subject === 'entry' && op.type !== 'delete'}<button class="secondary" disabled={!app.canWrite} onclick={() => app.readd(op)}>{messages.readd}</button>{/if}
      </div>
    </div>
  {/each}
  {#each app.unreadable as u (u.tab + u.row)}
    <div style="margin-bottom: 12px" data-testid="unreadable">
      <b>{u.tab} · {u.text || '—'}</b>
      <p class="muted">{messages.rowNotUnderstood(u.row, messages.unreadableReasons[u.reason])}</p>
    </div>
  {/each}
  {#if !app.needsAttention}<p class="muted">{messages.nothingToReview}</p>{/if}
</section>

{#if waiting.length}
  <section class="card">
    <h3>{messages.pending}</h3>
    {#each waiting as op (op.opId)}
      <div class="stat"><span>{opName(op)} · {op.subject === 'snapshot' ? op.snapshot?.account : op.entry?.description || op.entry?.place || op.entry?.category || ''}</span><span>{op.subject === 'snapshot' ? (op.snapshot ? fmt(op.snapshot.balance) : '') : op.entry ? fmt(op.entry.money) : ''}</span></div>
    {/each}
  </section>
{/if}

<section class="card">
  <h3>{messages.recentChanges}</h3>
  {#each recent as op (op.opId)}
    <div class="stat">
      <span>{opName(op)} · {dateLabel((op.subject === 'snapshot' ? op.snapshot?.date : op.entry?.date) ?? '1970-01-01')} {op.subject === 'snapshot' ? op.snapshot?.account : op.entry?.description || op.entry?.place || ''}</span>
      {#if op.undone}<span class="muted">{messages.undone}</span>
      {:else if op.type !== 'add' || op.entry || op.snapshot}<button class="secondary" disabled={!app.canWrite} onclick={() => app.undoOp(op)} data-testid="undo">{messages.undo}</button>{/if}
    </div>
  {:else}<p class="muted">{messages.noChanges}</p>{/each}
</section>
