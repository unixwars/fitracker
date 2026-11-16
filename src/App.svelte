<script lang="ts">
  import { onMount } from 'svelte'
  import type { AppState, Tab } from './lib/app.svelte'
  import { messages } from './lib/messages'
  import { TAB_ICON_PATHS } from './lib/tabIcons'
  import ActivityScreen from './lib/ui/ActivityScreen.svelte'
  import AddScreen from './lib/ui/AddScreen.svelte'
  import FirstRunScreen from './lib/ui/FirstRunScreen.svelte'
  import MonthScreen from './lib/ui/MonthScreen.svelte'
  import SettingsScreen from './lib/ui/SettingsScreen.svelte'
  import ThemeMenu from './lib/ui/ThemeMenu.svelte'

  let { app }: { app: AppState } = $props()
  const tabs: Tab[] = ['add', 'month', 'activity', 'settings']

  onMount(() => {
    void app.init()
    // The first tap of a session is the moment a browser lets Google's sign-in window open, so a silent sign-in that
    // could not run at launch is tried again inside it. Buttons that sign in themselves opt out.
    const firstTap = (e: Event) => { if (!(e.target as Element | null)?.closest?.('[data-no-silent]')) void app.trySilent(true) }
    document.addEventListener('click', firstTap, { capture: true })
    return () => document.removeEventListener('click', firstTap, { capture: true })
  })
</script>

<div class="shell">
  <header class="top">
    <span class="brand"><img class="logo" src={import.meta.env.BASE_URL + 'favicon.svg'} alt="" width="28" height="28" /><strong><span class="fi">{messages.appName.slice(0, 2)}</span>{messages.appName.slice(2)}</strong></span>
    <span class="top-right">
      {#if app.pendingCount}<span class="pill info" role="status" data-testid="status-pill">{messages.syncPending(app.pendingCount)}</span>{/if}
      <ThemeMenu {app} />
    </span>
  </header>

  {#if !app.online}<div class="banner" role="status" data-testid="offline">{messages.offline}</div>{/if}
  {#if app.reconnectNeeded && app.online}
    <div class="banner warn" role="alert" data-testid="reconnect">
      <span>{messages.reconnectBanner}</span>
      <button class="secondary" data-no-silent onclick={() => app.reconnect()}>{messages.reconnect}</button>
    </div>
  {/if}
  {#if app.status === 'newer'}<div class="banner warn" role="alert">{messages.newerBanner}</div>{/if}
  {#if app.status === 'unrecognised'}<div class="banner warn" role="alert" data-testid="unrecognised">{messages.unrecognisedBanner}</div>{/if}

  <main>
    {#if app.status === 'unlinked'}<FirstRunScreen {app} />
    {:else if app.tab === 'add'}<AddScreen {app} />
    {:else if app.tab === 'month'}<MonthScreen {app} />
    {:else if app.tab === 'activity'}<ActivityScreen {app} />
    {:else}<SettingsScreen {app} />{/if}
  </main>

  {#if app.status !== 'unlinked'}
  <nav class="tabbar" aria-label="Main">
    {#each tabs as t (t)}
      <button aria-current={app.tab === t ? 'page' : undefined} onclick={() => (app.tab = t)} data-testid={'tab-' + t}>
        <svg class="tabicon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d={TAB_ICON_PATHS[t]} /></svg>
        <span>{messages.tabs[t]}</span>
        {#if t === 'activity' && app.needsAttention}<span class="badge" data-testid="badge">{app.needsAttention}</span>{/if}
      </button>
    {/each}
  </nav>
  {/if}
</div>
