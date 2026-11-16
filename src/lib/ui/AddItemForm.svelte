<script lang="ts">
  import type { AppState } from '../app.svelte'
  import { messages } from '../messages'
  import { CURRENCIES, type Currency, type EntryType } from '../types'

  let { app, kind }: { app: AppState; kind: 'account' | 'category' } = $props()
  let name = $state('')
  let currency = $state<Currency>(app.lists.base)
  let type = $state<EntryType>('expense')
  let reason = $state('')
  let undoNote = $state('')
  let busy = $state(false)
  const added = $derived(app.lastAdded?.kind === kind ? app.lastAdded : null)

  async function submit(ev: SubmitEvent) {
    ev.preventDefault()
    if (busy) return
    busy = true
    reason = ''
    undoNote = ''
    const r = kind === 'account' ? await app.addAccount(name, currency) : await app.addCategory(name, type)
    busy = false
    if (r.ok) name = ''
    else reason = messages.itemReasons[r.reason]
  }
  async function undo() {
    const r = await app.undoLastAdd()
    undoNote = r === 'ok' ? '' : messages.undoRefused[r]
  }
</script>

<form class="additem" onsubmit={submit} data-testid={'add-' + kind}>
  <label class="field"><span>{messages.itemName}</span><input bind:value={name} autocomplete="off" maxlength="120" data-testid={'add-' + kind + '-name'} /></label>
  <label class="field">
    {#if kind === 'account'}
      <span>{messages.itemCurrency}</span>
      <select bind:value={currency} data-testid="add-account-currency">{#each CURRENCIES as c (c)}<option value={c}>{c}</option>{/each}</select>
    {:else}
      <span>{messages.itemType}</span>
      <select bind:value={type} data-testid="add-category-type"><option value="expense">{messages.kinds.expense}</option><option value="income">{messages.kinds.income}</option></select>
    {/if}
  </label>
  <button type="submit" class="secondary" disabled={!app.canWrite || busy} data-testid={'add-' + kind + '-submit'}>{kind === 'account' ? messages.addAccount : messages.addCategory}</button>
  {#if reason}<p class="err" role="alert" data-testid="add-reason">{reason}</p>{/if}
  {#if added}
    <p class="muted" data-testid="added">{messages.addedItem(added.name)} <button type="button" class="secondary" onclick={undo} data-testid="undo-add">{messages.undoAdd}</button></p>
  {/if}
  {#if undoNote}<p class="muted" role="status">{undoNote}</p>{/if}
</form>
