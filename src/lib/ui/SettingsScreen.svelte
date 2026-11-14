<script lang="ts">
  import type { AppState } from '../app.svelte'
  import type { Theme } from '../config'
  import { messages } from '../messages'
  import { BOOK_VERSION } from '../schema'

  let { app }: { app: AppState } = $props()
  let confirmingUnlink = $state(false)
  const linked = $derived(Boolean(app.sheetId))
  // The name and tab ids: from the device, then once signed in. Reading signedIn here makes the effect re-run on sign-in.
  $effect(() => { if (app.sheetId && (app.signedIn || !app.sheetName)) void app.loadSheetInfo() })
</script>

<h2 style="margin: 4px 0 12px">{messages.settingsTitle}</h2>

<div class="tiles">
  <section class="card tile">
    <span class="tile-label">{messages.linked}</span>
    {#if linked}
      <a class="tile-main" href={app.sheetLink} target="_blank" rel="noopener" data-testid="open-sheet">{app.sheetName || messages.openSheet}</a>
    {:else}
      <span class="tile-main muted">{messages.notLinked}</span>
    {/if}
    {#if linked && app.signedIn && !confirmingUnlink}
      <button class="secondary" onclick={() => (confirmingUnlink = true)} data-testid="unlink">{messages.unlinkSheet}</button>
    {/if}
  </section>
  {#if app.signedIn}
    <section class="card tile">
      <span class="tile-label">{messages.account}</span>
      <span class="tile-main">
        {app.accountEmail}
      </span>
      <button class="secondary" onclick={() => app.signOut()} data-testid="sign-out">{messages.signOut}</button>
    </section>
  {/if}
</div>
{#if linked && app.signedIn && confirmingUnlink}
  <div class="banner" role="alertdialog" style="margin: 0 0 12px" data-testid="unlink-confirm">
    <span>{messages.unlinkWarnSheet}</span>
    <span class="row" style="flex: 0 0 auto">
      <button class="secondary" onclick={() => (confirmingUnlink = false)}>{messages.cancel}</button>
      <button class="secondary" onclick={async () => { confirmingUnlink = false; await app.unlink() }} data-testid="unlink-yes">{messages.unlinkConfirm}</button>
    </span>
  </div>
{/if}
{#if app.message}<p class="err" role="alert">{app.message}</p>{/if}

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
  <div class="stat"><span>{messages.version}</span><span>{BOOK_VERSION}</span></div>
</section>
