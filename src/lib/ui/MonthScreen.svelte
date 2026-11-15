<script lang="ts">
  import Alert from './Alert.svelte'
  import type { AppState } from '../app.svelte'
  import { messages } from '../messages'
  import { monthView, UNCATEGORISED, type CategoryRow } from '../month'
  import type { Entry } from '../rows'
  import CategoryIcon from './CategoryIcon.svelte'
  import DayList from './DayList.svelte'
  import EntrySheet from './EntrySheet.svelte'
  import { dateLabel, fmt, monthLabel, shiftMonth } from './format'

  let { app }: { app: AppState } = $props()

  const view = $derived(monthView({ entries: app.displayed, lists: app.lists, rates: app.rates, month: app.month }))
  let mode = $state<'category' | 'day'>('category')
  let open = $state<string | null>(null)
  let editing = $state<Entry | null>(null)

  const pct = (c: CategoryRow) => (c.planned.minor > 0 ? Math.min(100, (c.actual.minor / c.planned.minor) * 100) : c.actual.minor > 0 ? 100 : 0)
  const over = (c: CategoryRow) => c.planned.minor > 0 && c.actual.minor > c.planned.minor

  function entriesOf(kind: 'expense' | 'income', name: string): Entry[] {
    const known = new Set(app.lists.categories.filter((c) => c.type === kind).map((c) => c.name))
    return app.displayed
      .filter((e) => e.kind === kind && e.date.startsWith(app.month) && (name === UNCATEGORISED ? !e.category || !known.has(e.category) : e.category === name))
      .sort((a, b) => b.date.localeCompare(a.date))
  }
  const toggle = (key: string) => (open = open === key ? null : key)
  const visible = (c: CategoryRow) => c.planned.minor > 0 || c.actual.minor > 0
</script>

<div class="monthnav">
  <button aria-label={messages.prevMonth} onclick={() => (app.month = shiftMonth(app.month, -1))}>‹</button>
  <h2>{monthLabel(app.month)}</h2>
  <button aria-label={messages.nextMonth} onclick={() => (app.month = shiftMonth(app.month, 1))}>›</button>
</div>

<div class="modes" role="group" aria-label={messages.viewBy}>
  <button class="secondary" aria-pressed={mode === 'category'} onclick={() => (mode = 'category')} data-testid="by-category">{messages.byCategory}</button>
  <button class="secondary" aria-pressed={mode === 'day'} onclick={() => (mode = 'day')} data-testid="by-day">{messages.byDay}</button>
</div>

{#if mode === 'day'}
  <DayList entries={app.displayed} month={app.month} onedit={(e) => (editing = e)} />
{:else}
<p class="muted" data-testid="accounts-included">{messages.accountsIncluded(view.accounts.included, view.accounts.total)}</p>
<section class="card">
  <h3>{messages.expenses}</h3>
  <div class="stat"><span>{messages.planned}</span><b>{fmt(view.expenses.planned)}</b></div>
  <div class="stat"><span>{messages.actual}</span><b data-testid="expenses-actual">{fmt(view.expenses.actual)}</b></div>
  <div class="stat muted"><span>{messages.regular}</span><span>{fmt(view.expenses.regular)}</span></div>
  <div class="stat muted"><span>{messages.business}</span><span>{fmt(view.expenses.business)}</span></div>
  {#each view.expenses.categories.filter(visible) as c (c.name)}
    <button class="cat" onclick={() => toggle('e:' + c.name)} aria-expanded={open === 'e:' + c.name}>
      <span class="line"><span class="name"><CategoryIcon name={c.name} custom={app.categoryCustom(c.name)} />{c.name}</span><span class="amt">{fmt(c.actual)} / {fmt(c.planned)}<svg class="chev" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></span>
      <span class="bar" class:over={over(c)}><i style="width: {pct(c)}%"></i></span>
    </button>
    {#if open === 'e:' + c.name}
      {#each entriesOf('expense', c.name) as e (e.id)}
        <button class="entry" onclick={() => (editing = e)}>
          <span>{dateLabel(e.date)} · {e.place || e.description || '—'}</span><b class="amt">{fmt(e.money)}<svg class="pen" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></b>
        </button>
      {:else}<p class="muted">{messages.noEntries}</p>{/each}
    {/if}
  {/each}
</section>

<section class="card">
  <h3>{messages.income}</h3>
  <div class="stat"><span>{messages.planned}</span><b>{fmt(view.income.planned)}</b></div>
  <div class="stat"><span>{messages.actual}</span><b>{fmt(view.income.actual)}</b></div>
  <div class="stat"><span>{messages.savingsRate}</span><b>{view.savingsRate === null ? messages.noSavingsRate : Math.round(view.savingsRate * 100) + '%'}</b></div>
  {#each view.income.categories.filter(visible) as c (c.name)}
    <button class="cat" onclick={() => toggle('i:' + c.name)} aria-expanded={open === 'i:' + c.name}>
      <span class="line"><span class="name"><CategoryIcon name={c.name} custom={app.categoryCustom(c.name)} />{c.name}</span><span class="amt">{fmt(c.actual)}<svg class="chev" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></span>
    </button>
    {#if open === 'i:' + c.name}
      {#each entriesOf('income', c.name) as e (e.id)}
        <button class="entry" onclick={() => (editing = e)}><span>{dateLabel(e.date)} · {e.description || '—'}</span><b class="amt">{fmt(e.money)}<svg class="pen" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></b></button>
      {/each}
    {/if}
  {/each}
</section>

{#if view.approx}<p class="muted">{messages.approx}</p>{/if}
{#each view.missingRates as c (c)}<Alert>{messages.ratesMissing(c)}</Alert>{/each}
{/if}
{#if editing}<EntrySheet {app} entry={editing} onclose={() => (editing = null)} />{/if}
