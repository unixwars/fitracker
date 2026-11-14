<script lang="ts">
  import type { AppState } from '../app.svelte'
  import { entryToForm, toEntry, type FormState } from '../addForm'
  import { messages } from '../messages'
  import type { Entry } from '../rows'
  import EntryForm from './EntryForm.svelte'

  // `repair` edits or deletes a row the app could not read (the entry is a draft built from that row).
  let { app, entry, onclose, repair = false }: { app: AppState; entry: Entry; onclose: () => void; repair?: boolean } = $props()

  // svelte-ignore state_referenced_locally
  let form = $state<FormState>(entryToForm(entry))
  let confirming = $state(false)

  async function onsubmit(f: FormState) {
    const fixed = toEntry(f, entry.id, app.lists, app.rates)
    if (repair) await app.fixRow(fixed)
    else await app.edit(fixed, entry)
    onclose()
  }
  async function remove() {
    if (repair) await app.deleteRow(entry)
    else await app.remove(entry)
    onclose()
  }
</script>

<div class="sheet-back" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose() }}>
  <div class="sheet" role="dialog" aria-label={messages.edit}>
    <div class="row" style="margin-bottom: 12px">
      <h2>{messages.edit}</h2>
      <button class="secondary fit" onclick={onclose}>{messages.cancel}</button>
    </div>
    <EntryForm bind:form lists={app.lists} rates={app.rates} history={[]} device={app.device} submitLabel={messages.saveChanges} {onsubmit} lockKind />
    <div style="margin-top: 16px">
      {#if confirming}
        <p>{repair ? messages.confirmDeleteRow : messages.confirmDelete}</p>
        <div class="row">
          <button class="secondary" onclick={() => (confirming = false)}>{messages.cancel}</button>
          <button class="secondary danger" onclick={remove} data-testid="confirm-delete">{messages.confirmDeleteYes}</button>
        </div>
      {:else}
        <button class="secondary danger" style="width:100%" disabled={!app.canWrite} onclick={() => (confirming = true)} data-testid="delete">{messages.delete}</button>
      {/if}
    </div>
  </div>
</div>
