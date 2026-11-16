<script lang="ts">
    import type { AppState } from '../app.svelte'
  import { initialForm, rememberChoices, resetAfterSave, toEntry, type FormState } from '../addForm'
  import { messages } from '../messages'
  import type { LatLng } from '../places'
  import EntryForm from './EntryForm.svelte'

  let { app }: { app: AppState } = $props()

  // svelte-ignore state_referenced_locally
  let form = $state<FormState>(initialForm(app.device, app.lists))
  let toast = $state('')
  // Lists arrive after the first sync; fill remembered defaults once they are known.
  // svelte-ignore state_referenced_locally
  let seeded = $state(app.lists.accounts.length > 0)
  $effect(() => {
    if (!seeded && app.lists.accounts.length > 0) {
      form = { ...initialForm(app.device, app.lists), amount: form.amount }
      seeded = true
    }
  })
  async function onsubmit(f: FormState, coords: LatLng | null) {
    if (!app.canWrite) return
    const entry = toEntry(f, crypto.randomUUID(), app.lists, app.rates)
    // Clear straight away so the next entry can be typed while this one is being stored.
    form = resetAfterSave(f, app.lists)
    try {
      if (coords && entry.place) {
        const rest = app.device.places.filter((p) => p.name !== entry.place)
        app.setDevice({ places: [...rest, { name: entry.place, ...coords }] })
      }
      await app.save(entry, rememberChoices(app.device, f))
      toast = messages.addSaved
    } catch {
      form = f
      toast = messages.saveFailed
    }
    setTimeout(() => (toast = ''), 1800)
  }
</script>

<EntryForm bind:form icons={app} lists={app.lists} rates={app.rates} history={app.displayed} device={app.device} submitLabel={messages.addSave} {onsubmit} />
{#if toast}<div class="toast" role="status">{toast}</div>{/if}
