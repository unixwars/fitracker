<script lang="ts">
  import { onMount } from 'svelte'
  import type { AppState, Tab } from './lib/app.svelte'
  import { messages } from './lib/messages'
  import ActivityScreen from './lib/ui/ActivityScreen.svelte'
  import AddScreen from './lib/ui/AddScreen.svelte'
  import MonthScreen from './lib/ui/MonthScreen.svelte'
  import SettingsScreen from './lib/ui/SettingsScreen.svelte'

  let { app }: { app: AppState } = $props()
  const tabs: Tab[] = ['add', 'month', 'activity', 'settings']

  onMount(() => { void app.init() })
</script>

<div class="shell">
  <header class="top">
    <span class="brand"><img class="logo" src={import.meta.env.BASE_URL + 'favicon.svg'} alt="" width="28" height="28" /><strong><span class="fi">{messages.appName.slice(0, 2)}</span>{messages.appName.slice(2)}</strong></span>
    <span class="pill" data-testid="year-pill">{app.year}{app.pendingCount ? ' · ' + messages.syncPending(app.pendingCount) : ''}</span>
  </header>

  {#if !app.online}<div class="banner" role="status" data-testid="offline">{messages.offline}</div>{/if}
  {#if app.authExpired && app.online}
    <div class="banner warn" role="alert" data-testid="reconnect">
      <span>{messages.reconnectBanner}</span>
      <button class="secondary" onclick={() => app.reconnect()}>{messages.reconnect}</button>
    </div>
  {/if}
  {#if app.status === 'newer'}<div class="banner warn" role="alert">{messages.newerBanner}</div>{/if}
  {#if app.status === 'needs-migration'}
    <div class="banner warn" role="alert">
      <span>{messages.needsMigrationBanner}</span>
      <button class="secondary" onclick={() => (app.tab = 'settings')}>{messages.openSettings}</button>
    </div>
  {/if}
  {#if app.status === 'unlinked'}
    <div class="banner warn">
      <span>{messages.noSheet}</span>
      <button class="secondary" onclick={() => (app.tab = 'settings')}>{messages.openSettings}</button>
    </div>
  {/if}

  <main>
    {#if app.tab === 'add'}<AddScreen {app} />
    {:else if app.tab === 'month'}<MonthScreen {app} />
    {:else if app.tab === 'activity'}<ActivityScreen {app} />
    {:else}<SettingsScreen {app} />{/if}
  </main>

  <nav class="tabbar" aria-label="Main">
    {#each tabs as t (t)}
      <button aria-current={app.tab === t ? 'page' : undefined} onclick={() => (app.tab = t)} data-testid={'tab-' + t}>
        {messages.tabs[t]}
        {#if t === 'activity' && app.attention.length}<span class="badge" data-testid="badge">{app.attention.length}</span>{/if}
      </button>
    {/each}
  </nav>
</div>
