<script lang="ts">
  import type { AppState } from '../app.svelte'
  import { entryToForm, toEntry, type FormState } from '../addForm'
  import { messages } from '../messages'
  import type { Entry } from '../rows'
  import EntryForm from './EntryForm.svelte'

  let { app, entry, onclose }: { app: AppState; entry: Entry; onclose: () => void } = $props()

  // svelte-ignore state_referenced_locally
  let form = $state<FormState>(entryToForm(entry))
  let confirming = $state(false)

  async function onsubmit(f: FormState) {
    await app.edit(toEntry(f, entry.id), entry)
    onclose()
  }
  async function remove() {
    await app.remove(entry)
    onclose()
  }
</script>

<div class="sheet-back" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose() }}>
  <div class="sheet" role="dialog" aria-label={messages.edit}>
    <div class="row" style="margin-bottom: 12px">
      <h2>{messages.edit}</h2>
      <button class="secondary fit" onclick={onclose}>{messages.cancel}</button>
    </div>
    <EntryForm bind:form lists={app.lists} history={[]} device={app.device} submitLabel={messages.saveChanges} {onsubmit} lockKind />
    <div style="margin-top: 16px">
      {#if confirming}
        <p>{messages.confirmDelete}</p>
        <div class="row">
          <button class="secondary" onclick={() => (confirming = false)}>{messages.cancel}</button>
          <button class="secondary danger" onclick={remove} data-testid="confirm-delete">{messages.confirmDeleteYes}</button>
        </div>
      {:else}
        <button class="secondary danger" style="width:100%" onclick={() => (confirming = true)} data-testid="delete">{messages.delete}</button>
      {/if}
    </div>
  </div>
</div>
