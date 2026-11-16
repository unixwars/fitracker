<script lang="ts">
  import type { AppState } from '../app.svelte'
  import { messages } from '../messages'
  import type { Op } from '../outbox'
  import { repairDraft } from '../repairDraft'
  import { needsCategory } from '../needsCategory'
  import { rowSummary } from '../unreadableSummary'
  import { todayLocal } from '../rows'
  import type { Entry } from '../rows'
  import type { Unreadable } from '../types'
  import CategoryIcon from './CategoryIcon.svelte'
  import EntrySheet from './EntrySheet.svelte'
  import SnapshotForm from './SnapshotForm.svelte'
  import { dateLabel, fmt } from './format'

  let { app }: { app: AppState } = $props()
  const recent = $derived([...app.ops].filter((o) => o.status === 'done' && !o.undoOf).reverse().slice(0, 30))
  const waiting = $derived(app.ops.filter((o) => o.status === 'pending'))
  let fixing = $state<Unreadable | null>(null)
  let editing = $state<Entry | null>(null)
  const uncategorised = $derived(needsCategory(app.displayed, app.lists))
  const SHOWN = 20
  // Every Ledger row can be fixed here: by its id when it has one, otherwise by its row while it still holds what is shown.
  const fixable = (u: Unreadable) => u.tab === 'Ledger' && Array.isArray(u.raw)
  // The tab ids for the links come from the device or, once signed in, from one request; re-run when either changes.
  $effect(() => { if (app.unreadable.length && (app.signedIn || !app.sheetName)) void app.loadSheetInfo() })
  const opName = (op: Op) => (op.subject === 'snapshot' ? messages.snapshotOps[op.type as 'add' | 'delete'] : messages.ops[op.type])
  const opAmount = (op: Op) => (op.subject === 'snapshot' ? (op.snapshot ? fmt(op.snapshot.balance) : '') : op.entry ? fmt(op.entry.money) : '')
  const opText = (op: Op) =>
    op.subject === 'snapshot'
      ? op.snapshot ? `${op.snapshot.account} ${fmt(op.snapshot.balance)}` : op.entryId
      : op.entry ? `${op.entry.description || op.entry.place || op.entry.category || ''} ${fmt(op.entry.money)}` : op.entryId
</script>

<h2 style="margin: 4px 0 12px">{messages.activityTitle}</h2>

<section class="card" data-testid="attention">
  <h3>{messages.needsAttention}</h3>
  {#each app.attention as op (op.opId)}
    <div class="attn-blocking" style="margin-bottom: 12px" data-testid="flagged">
      <b>{opName(op)}: {opText(op)}</b>
      <p class="muted">{messages.reasons[op.reason ?? 'Other']}</p>
      <div class="row">
        <button class="secondary" onclick={() => app.discard(op)}>{messages.discard}</button>
        {#if op.subject === 'entry' && op.type !== 'delete'}<button class="secondary" disabled={!app.canWrite} onclick={() => app.readd(op)}>{messages.readd}</button>{/if}
      </div>
    </div>
  {/each}
  {#each app.unreadable as u (u.tab + u.row)}
    {@const sum = rowSummary(u)}
    <div class="attn-blocking" style="margin-bottom: 12px" data-testid="unreadable">
      <b>{sum.title}</b>
      {#if sum.detail}<p class="muted" style="margin: 2px 0">{sum.detail}</p>{/if}
      <p class="muted">{messages.unreadableReasons[u.reason]}. {fixable(u) ? messages.fixInApp : messages.fixInSheet}</p>
      <div class="row">
        {#if fixable(u)}<button class="secondary" disabled={!app.canWrite} onclick={() => (fixing = u)} data-testid="fix-row">{messages.fixRow}</button>{/if}
        <a class="linkbtn" href={app.rowUrl(u)} target="_blank" rel="noopener" data-testid="open-row">{messages.openInSheets}</a>
      </div>
    </div>
  {/each}
  {#if !app.needsAttention}<p class="muted">{messages.nothingToReview}</p>{/if}
</section>

{#if uncategorised.length && app.lists.categories.length}
  <section class="card" data-testid="needs-category">
    <h3>{messages.needsCategoryTitle}</h3>
    <p class="muted">{messages.needsCategoryHint}</p>
    {#each uncategorised.slice(0, SHOWN) as x (x.id)}
      <button class="entry attn-soft" onclick={() => (editing = x)} data-testid="needs-category-entry">
        <span>{dateLabel(x.date)} · {x.place || x.description || '—'}</span><b class="amt">{fmt(x.money)}</b>
      </button>
    {/each}
    {#if uncategorised.length > SHOWN}<p class="muted">{messages.moreEntries(uncategorised.length - SHOWN)}</p>{/if}
  </section>
{/if}

{#if waiting.length}
  <section class="card">
    <h3>{messages.pending}</h3>
    {#each waiting as op (op.opId)}
      <div class="stat"><span>{opName(op)} · {op.subject === 'snapshot' ? op.snapshot?.account : op.entry?.description || op.entry?.place || op.entry?.category || ''}</span><span>{op.subject === 'snapshot' ? (op.snapshot ? fmt(op.snapshot.balance) : '') : op.entry ? fmt(op.entry.money) : ''}</span></div>
    {/each}
  </section>
{/if}

<SnapshotForm {app} />

<section class="card">
  <h3>{messages.recentChanges}</h3>
  {#each recent as op (op.opId)}
    <div class="stat recent">
      <span>{#if op.subject !== 'snapshot' && op.entry?.category}<CategoryIcon name={op.entry.category} custom={app.categoryCustom(op.entry.category)} />{/if}{opName(op)} · {dateLabel((op.subject === 'snapshot' ? op.snapshot?.date : op.entry?.date) ?? '1970-01-01')} {op.subject === 'snapshot' ? op.snapshot?.account : op.entry?.description || op.entry?.place || ''}</span>
      <b class="num" data-testid="recent-amount">{opAmount(op)}</b>
      {#if op.undone}<button class="secondary" disabled={!app.canWrite} onclick={() => app.redoOp(op)} data-testid="redo">{messages.redo}</button>
      {:else if !op.repair && (op.type !== 'add' || op.entry || op.snapshot)}<button class="secondary" disabled={!app.canWrite} onclick={() => app.undoOp(op)} data-testid="undo">{messages.undo}</button>{/if}
    </div>
  {:else}<p class="muted">{messages.noChanges}</p>{/each}
</section>

{#if fixing}<EntrySheet {app} entry={repairDraft(fixing.raw ?? [], app.lists, todayLocal())} repair repairAt={fixing.id ? undefined : { row: fixing.row, raw: $state.snapshot(fixing.raw ?? []) }} onclose={() => (fixing = null)} />{/if}
{#if editing}<EntrySheet {app} entry={editing} onclose={() => (editing = null)} />{/if}
