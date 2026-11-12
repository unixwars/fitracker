<script lang="ts">
  import type { AppState } from '../app.svelte'
  import { messages } from '../messages'
  import { monthView, UNCATEGORISED, type CategoryRow } from '../month'
  import type { Entry } from '../rows'
  import CategoryIcon from './CategoryIcon.svelte'
  import EntrySheet from './EntrySheet.svelte'
  import { dateLabel, fmt, monthLabel, shiftMonth } from './format'

  let { app }: { app: AppState } = $props()

  const view = $derived(monthView(app.displayed, app.lists, app.month, app.rates.rates, app.rates.base))
  let open = $state<string | null>(null)
  let editing = $state<Entry | null>(null)

  const pct = (c: CategoryRow) => (c.planned.minor > 0 ? Math.min(100, (c.actual.minor / c.planned.minor) * 100) : c.actual.minor > 0 ? 100 : 0)
  const over = (c: CategoryRow) => c.planned.minor > 0 && c.actual.minor > c.planned.minor

  function entriesOf(kind: 'expense' | 'income', name: string): Entry[] {
    const known = new Set(kind === 'expense' ? app.lists.expenseCategories : app.lists.incomeCategories)
    return app.displayed
      .filter((e) => e.kind === kind && e.date.startsWith(app.month) && (name === UNCATEGORISED ? !e.category || !known.has(e.category) : e.category === name))
      .sort((a, b) => b.date.localeCompare(a.date))
  }
  const toggle = (key: string) => (open = open === key ? null : key)
  const visible = (c: CategoryRow) => c.planned.minor > 0 || c.actual.minor > 0
</script>

<div class="monthnav">
  <button aria-label={messages.prevMonth} onclick={() => (app.month = shiftMonth(app.month, -1, app.year))}>‹</button>
  <h2>{monthLabel(app.month)}</h2>
  <button aria-label={messages.nextMonth} onclick={() => (app.month = shiftMonth(app.month, 1, app.year))}>›</button>
</div>

<section class="card">
  <h3>{messages.expenses}</h3>
  <div class="stat"><span>{messages.planned}</span><b>{fmt(view.expenses.planned)}</b></div>
  <div class="stat"><span>{messages.actual}</span><b data-testid="expenses-actual">{fmt(view.expenses.actual)}</b></div>
  <div class="stat muted"><span>{messages.regular}</span><span>{fmt(view.expenses.regular)}</span></div>
  <div class="stat muted"><span>{messages.business}</span><span>{fmt(view.expenses.business)}</span></div>
  {#each view.expenses.categories.filter(visible) as c (c.name)}
    <button class="cat" onclick={() => toggle('e:' + c.name)} aria-expanded={open === 'e:' + c.name}>
      <span class="line"><span class="name"><CategoryIcon name={c.name} />{c.name}</span><span>{fmt(c.actual)} / {fmt(c.planned)}</span></span>
      <span class="bar" class:over={over(c)}><i style="width: {pct(c)}%"></i></span>
    </button>
    {#if open === 'e:' + c.name}
      {#each entriesOf('expense', c.name) as e (e.id)}
        <button class="entry" onclick={() => (editing = e)}>
          <span>{dateLabel(e.date)} · {e.place || e.description || '—'}</span><b>{fmt(e.money)}</b>
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
      <span class="line"><span class="name"><CategoryIcon name={c.name} />{c.name}</span><span>{fmt(c.actual)}</span></span>
    </button>
    {#if open === 'i:' + c.name}
      {#each entriesOf('income', c.name) as e (e.id)}
        <button class="entry" onclick={() => (editing = e)}><span>{dateLabel(e.date)} · {e.description || '—'}</span><b>{fmt(e.money)}</b></button>
      {/each}
    {/if}
  {/each}
</section>

{#if view.approx}<p class="muted">{messages.approx}</p>{/if}
{#each view.missingRates as c (c)}<p class="err" role="alert">{messages.ratesMissing(c)}</p>{/each}
{#if editing}<EntrySheet {app} entry={editing} onclose={() => (editing = null)} />{/if}
