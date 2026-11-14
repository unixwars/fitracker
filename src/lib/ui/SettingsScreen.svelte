<script lang="ts">
  import type { AppState } from '../app.svelte'
  import type { Theme } from '../config'
  import { messages } from '../messages'
  import { BOOK_VERSION } from '../schema'

  let { app }: { app: AppState } = $props()
  let confirmingUnlink = $state(false)
  const linked = $derived(Boolean(app.sheetId))
</script>

<h2 style="margin: 4px 0 12px">{messages.settingsTitle}</h2>

<section class="card">
  <p class="muted">{linked ? messages.linked : messages.notLinked}</p>
  <button class="secondary" onclick={() => app.link()} data-testid="link">{linked ? messages.relinkLedger : messages.linkLedger}</button>
  {#if linked}
    {#if confirmingUnlink}
      <div class="banner" role="alertdialog" style="margin: 8px 0 0" data-testid="unlink-confirm">
        <span>{messages.unlinkWarnSheet}</span>
        <span class="row" style="flex: 0 0 auto">
          <button class="secondary" onclick={() => (confirmingUnlink = false)}>{messages.cancel}</button>
          <button class="secondary" onclick={async () => { confirmingUnlink = false; await app.unlink() }} data-testid="unlink-yes">{messages.unlinkConfirm}</button>
        </span>
      </div>
    {:else}
      <button class="secondary" style="margin-top: 8px" onclick={() => (confirmingUnlink = true)} data-testid="unlink">{messages.unlinkSheet}</button>
    {/if}
  {/if}
  {#if app.message}<p class="err" role="alert">{app.message}</p>{/if}
</section>

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
  <div class="row" style="margin-top: 8px">
    <button class="secondary" onclick={() => app.reconnect()}>{messages.signIn}</button>
    <button class="secondary" onclick={() => app.signOut()}>{messages.signOut}</button>
  </div>
</section>
