<script lang="ts">
  import Alert from './Alert.svelte'
  import type { AppState } from '../app.svelte'
  import { annualView } from '../annual'
  import { accountsWithoutSnapshot, balancesView } from '../balances'
  import { flowsChart, netWorthChart, yearByCategoryChart, yearIncomeExpenseChart, yearShareChart } from '../chartData'
  import { messages } from '../messages'
  import { todayLocal } from '../rows'
  import type { Money } from '../types'
  import AreaChart from './charts/AreaChart.svelte'
  import BarChart from './charts/BarChart.svelte'
  import Donut from './charts/Donut.svelte'
  import { canGoNext, canGoPrev, earliestMonth, latestMonth } from '../navLimit'
  import { fmt, shiftMonth } from './format'

  let { app }: { app: AppState } = $props()
  const latest = $derived(latestMonth(app.displayed, todayLocal()))
  const earliest = $derived(earliestMonth(app.displayed, todayLocal()))
  const year = $derived(Number(app.month.slice(0, 4)))
  const view = $derived(annualView({ entries: app.displayed, lists: app.lists, rates: app.rates, year }))
  const balances = $derived(balancesView({ entries: app.displayed, snapshots: app.displayedSnapshots, lists: app.lists, rates: app.rates, year, today: todayLocal() }))
  const money = (minor: number): string => fmt({ minor, currency: app.lists.base })
  const m = (v: Money) => fmt(v)
  const incomeExpense = $derived(yearIncomeExpenseChart(view))
  const byCategory = $derived(yearByCategoryChart(view))
  const share = $derived(yearShareChart(view))
  const netWorth = $derived(netWorthChart(balances))
  const flows = $derived(flowsChart(balances))
  const noSnapshot = $derived(accountsWithoutSnapshot(app.lists, app.displayedSnapshots))
  const missing = $derived([...new Set([...view.missingRates, ...balances.missingRates])].sort())
</script>

<div class="monthnav">
  <button aria-label={messages.prevYear} disabled={!canGoPrev(app.month, 12, earliest)} onclick={() => (app.month = shiftMonth(app.month, -12))}>‹</button>
  <h2 data-testid="year-title">{year}</h2>
  <button aria-label={messages.nextYear} disabled={!canGoNext(app.month, 12, latest)} onclick={() => (app.month = shiftMonth(app.month, 12))}>›</button>
</div>
<p class="center"><span class="pill info" data-testid="accounts-included">{messages.accountsIncludedYear(view.accounts.included, view.accounts.total)}</span></p>

<section class="card" data-testid="year-totals">
  <div class="stat"><span>{messages.income}</span><b>{m(view.totals.income)}</b></div>
  <div class="stat"><span>{messages.expenses}</span><b data-testid="year-expenses">{m(view.totals.expenses)}</b></div>
  <div class="stat"><span>{messages.netSavings}</span><b>{m(view.totals.net)}</b></div>
  <div class="stat"><span>{messages.savingsRate}</span><b>{view.totals.savingsRate === null ? messages.noSavingsRate : Math.round(view.totals.savingsRate * 100) + '%'}</b></div>
</section>

<section class="card">
  <p class="muted">{messages.chartHint}</p>
  <BarChart title={messages.chartIncomeExpenses} labels={incomeExpense.labels} series={incomeExpense.series} line={incomeExpense.line} format={money} />
  <BarChart title={messages.chartByCategory} labels={byCategory.labels} series={byCategory.series} stacked format={money} />
  <Donut title={messages.chartShare} labels={share.labels} values={share.values} format={money} />
</section>

<section class="card">
  <AreaChart title={messages.chartNetWorth} labels={netWorth.labels} series={netWorth.series} format={money} />
  <BarChart title={messages.chartFlows} labels={flows.labels} series={flows.series} format={money} />
  {#if noSnapshot.length}
    <div class="banner" style="margin: 0 0 8px" data-testid="no-snapshot">
      <span>{messages.noSnapshotWarning(noSnapshot)}</span>
      <button class="secondary" onclick={() => { app.snapshotFormOpen = true; app.tab = 'activity' }} data-testid="record-balance">{messages.recordBalance}</button>
    </div>
  {/if}
  <p class="muted">{messages.balancesNote}</p>
</section>

{#if view.approx}<p class="muted">{messages.approx}</p>{/if}
{#each missing as c (c)}<Alert>{messages.ratesMissing(c)}</Alert>{/each}
