<script lang="ts">
  import type { AppState } from '../app.svelte'
  import { MIN_YEAR, type Theme } from '../config'
  import { messages } from '../messages'
  import { SCHEMA_VERSION } from '../schema'
  import { CURRENCIES, type Currency } from '../types'

  let { app }: { app: AppState } = $props()
  const years = Array.from({ length: new Date().getFullYear() + 1 - MIN_YEAR + 1 }, (_, i) => MIN_YEAR + i).reverse()
  let base = $state<Currency>('EUR')
  const linked = $derived(Boolean(app.sheets[app.year]))
</script>

<h2 style="margin: 4px 0 12px">{messages.settingsTitle}</h2>

<section class="card">
  <label class="field">
    <span>{messages.year}</span>
    <select value={app.year} onchange={(e) => app.setYear(Number(e.currentTarget.value))} data-testid="year">
      {#each years as y (y)}<option value={y}>{y}{app.sheets[y] ? ' ✓' : ''}</option>{/each}
    </select>
  </label>
  <p class="muted">{linked ? messages.linked : messages.notLinked}</p>
  <button class="secondary" onclick={() => app.link(app.year)} data-testid="link">{messages.linkSheet(app.year)}</button>
  {#if app.message}<p class="err" role="alert">{app.message}</p>{/if}
</section>

{#if app.status === 'needs-migration' && app.sheetVersion !== null}
  <section class="card" data-testid="migrate">
    <h3>{messages.migrateTitle}</h3>
    <p>{messages.migrateIntro}</p>
    <ul>{#each app.migrationSteps as m (m.from)}<li>{messages.migrateStep(m.from, m.to)}</li>{/each}</ul>
    <label class="field">
      <span>{messages.migrateBase}</span>
      <select bind:value={base}>{#each CURRENCIES as c (c)}<option value={c}>{c}</option>{/each}</select>
    </label>
    {#if app.flaggedRows.length}
      <p class="err">{messages.migrateFlagged}</p>
      <ul>{#each app.flaggedRows as r (r.kind + r.row)}<li>{r.kind} row {r.row}: {r.reason}</li>{/each}</ul>
    {/if}
    <button class="primary" onclick={() => app.migrate(base)}>{messages.migrateRun}</button>
  </section>
{/if}

<section class="card">
  <label class="field">
    <span>{messages.theme}</span>
    <select value={app.device.theme} onchange={(e) => app.setDevice({ theme: e.currentTarget.value as Theme })} data-testid="theme">
      <option value="system">{messages.themeSystem}</option>
      <option value="light">{messages.themeLight}</option>
      <option value="dark">{messages.themeDark}</option>
    </select>
  </label>
  <div class="stat"><span>{messages.syncStatus}</span><span>{app.pendingCount ? messages.syncPending(app.pendingCount) : messages.syncIdle}</span></div>
  <div class="stat"><span>{messages.version}</span><span>{app.sheetVersion ?? SCHEMA_VERSION}</span></div>
  <div class="row" style="margin-top: 8px">
    <button class="secondary" onclick={() => app.reconnect()}>{messages.signIn}</button>
    <button class="secondary" onclick={() => app.signOut()}>{messages.signOut}</button>
  </div>
</section>
