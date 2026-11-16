<script lang="ts">
  import type { AppState } from '../app.svelte'
  import { messages } from '../messages'
  import { todayLocal } from '../rows'
  import { cleanBalanceInput, initialSnapshotForm, toSnapshot, validateSnapshot, type SnapshotErrors } from '../snapshotForm'

  let { app }: { app: AppState } = $props()
  let form = $state({ date: todayLocal(), account: '', balance: '', note: '' }) // the account is chosen below, once the lists are there
  let errors = $state<SnapshotErrors>({})
  let saved = $state(false)
  const accounts = $derived(app.lists.accounts.filter((a) => a.active))
  // Starts on the account used last (or the first active one), as soon as the lists have loaded.
  $effect(() => { if (!form.account && accounts.length) form.account = initialSnapshotForm(app.lists, todayLocal(), app.device.lastCategory['snapshot:account']).account })

  async function submit(ev: SubmitEvent) {
    ev.preventDefault()
    errors = validateSnapshot(form, app.lists)
    if (Object.keys(errors).length) return
    app.setDevice({ lastCategory: { ...app.device.lastCategory, 'snapshot:account': form.account } })
    const snapshot = toSnapshot(form, crypto.randomUUID(), app.lists)
    form = { ...initialSnapshotForm(app.lists, todayLocal()), account: form.account } // cleared at once: a second tap has nothing to save
    try {
      await app.addSnapshot(snapshot)
      saved = true
    } catch {
      saved = false
      app.message = messages.snapshotSaveFailed
    }
  }
</script>

<details class="card" data-testid="snapshot-card" bind:open={app.snapshotFormOpen}>
  <summary><h3>{messages.recordBalance}</h3></summary>
  <form onsubmit={submit}>
    <label class="field"><span>{messages.account}</span>
      <select bind:value={form.account} data-testid="snapshot-account">{#each accounts as a, i (i)}<option value={a.name}>{a.name} ({a.currency})</option>{/each}</select>
      {#if errors.account}<span class="err">{messages.snapshotErrors.account}</span>{/if}
    </label>
    <label class="field"><span>{messages.snapshotDate}</span>
      <input type="date" bind:value={form.date} data-testid="snapshot-date" />
      {#if errors.date}<span class="err">{messages.snapshotErrors.date}</span>{/if}
    </label>
    <label class="field"><span>{messages.snapshotBalance}</span>
      <span class="balrow">
        <input inputmode="decimal" autocomplete="off" bind:value={form.balance} oninput={() => (form.balance = cleanBalanceInput(form.balance))} data-testid="snapshot-balance" />
        <button type="button" class="secondary" aria-label={messages.snapshotSign} onclick={() => (form.balance = form.balance.startsWith('-') ? form.balance.slice(1) : '-' + form.balance)} data-testid="snapshot-sign">±</button>
      </span>
      {#if errors.balance}<span class="err">{messages.snapshotErrors.balance}</span>{/if}
    </label>
    <label class="field"><span>{messages.snapshotNote}</span><input bind:value={form.note} data-testid="snapshot-note" /></label>
    <button type="submit" disabled={!app.canWrite} data-testid="snapshot-save">{messages.snapshotSave}</button>
    {#if saved}<p class="muted" data-testid="snapshot-saved">{messages.snapshotSaved}</p>{/if}
  </form>
</details>
