<script lang="ts">
  import Alert from './Alert.svelte'
  import CategoryIcon from './CategoryIcon.svelte'
  import IconPicker from './IconPicker.svelte'
  import InstallHelp from './InstallHelp.svelte'
  import type { AppState } from '../app.svelte'
  import { messages } from '../messages'
  import { APP_VERSION_LABEL } from '../buildInfo'
  import { BOOK_VERSION } from '../schema'
  import { newIssueUrl, RELEASES_URL } from '../projectLinks'

  let { app }: { app: AppState } = $props()
  let confirmingUnlink = $state(false)
  const linked = $derived(Boolean(app.sheetId))
  const sheetAccount = (name: string) => app.sheetLists.accounts.find((a) => a.name === name)
  const differs = (a: { name: string; inMonthly: boolean; inAnnual: boolean }) => {
    const s = sheetAccount(a.name)
    return Boolean(s) && (s!.inMonthly !== a.inMonthly || s!.inAnnual !== a.inAnnual)
  }
  const categoryNames = $derived([...new Set(app.lists.categories.filter((c) => c.active).map((c) => c.name))])
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
{#if app.message}<Alert>{app.message}</Alert>{/if}

{#if linked && app.lists.accounts.length}
  <section class="card" data-testid="shared-settings">
  <details class="fold" data-testid="accounts-fold">
    <summary><span>{messages.settingsAccounts}{#if app.lists.accounts.some(differs)} <small class="muted">· {messages.differsFromSheet}</small>{/if}</span></summary>
    <p class="muted">{messages.sharedSettingsNote}</p>
    {#each app.lists.accounts.filter((a) => a.active) as a (a.name)}
      <div class="stat acct" data-testid="account-row">
        <span><IconPicker id={'account:' + a.name} label={a.name} current={app.accountEmoji(a.name)} onpick={(e) => app.setIcon('account', a.name, e)} /> {a.name}{#if differs(a)} <small class="muted">· {messages.differsFromSheet}</small> <button class="secondary" disabled={!app.canWrite} onclick={() => app.resetAccountToggles(a.name)} data-testid="reset-toggles">{messages.resetToSheet}</button>{/if}</span>
        <span class="row" style="flex: 0 0 auto" role="group" aria-label={messages.countIn}>
          <span class="muted">{messages.countIn}</span>
          <label><input type="checkbox" checked={a.inMonthly} disabled={!app.canWrite} onchange={async (e) => { const box = e.currentTarget; const was = a.inMonthly; if (!(await app.setAccountToggle(a.name, 'inMonthly', box.checked))) box.checked = was }} data-testid="toggle-monthly" /> {messages.inMonth}</label>
          <label><input type="checkbox" checked={a.inAnnual} disabled={!app.canWrite} onchange={async (e) => { const box = e.currentTarget; const was = a.inAnnual; if (!(await app.setAccountToggle(a.name, 'inAnnual', box.checked))) box.checked = was }} data-testid="toggle-annual" /> {messages.inYear}</label>
        </span>
      </div>
    {/each}
  </details>
  </section>
  <section class="card">
  <details class="fold" data-testid="categories-fold">
    <summary><span>{messages.settingsCategories}</span></summary>
    {#each categoryNames as n (n)}
      <div class="stat"><span><IconPicker id={'category:' + n} label={n} current={app.categoryCustom(n) ?? ''} onpick={(e) => app.setIcon('category', n, e)}>{#snippet glyph()}<CategoryIcon name={n} custom={app.categoryCustom(n)} />{/snippet}</IconPicker> {n}</span></div>
    {/each}
  </details>
  </section>
{/if}

<section class="card about" data-testid="about">
<dl>
  <div><dt>{messages.syncStatus}</dt><dd>{app.pendingCount ? messages.syncPending(app.pendingCount) : messages.syncIdle}</dd></div>
  <div><dt>{messages.appVersion}</dt><dd><a href={RELEASES_URL} target="_blank" rel="noopener" data-testid="app-version">{APP_VERSION_LABEL}</a></dd></div>
  <div><dt>{messages.feedback}</dt><dd><a href={newIssueUrl(APP_VERSION_LABEL)} target="_blank" rel="noopener" data-testid="report-issue">{messages.reportIssue}</a></dd></div>
  <div><dt>{messages.version}</dt><dd>{BOOK_VERSION}</dd></div>
</dl>
<InstallHelp />
</section>
