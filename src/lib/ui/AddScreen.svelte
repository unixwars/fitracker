<script lang="ts">
  import { untrack } from 'svelte'
  import type { AppState } from '../app.svelte'
  import { initialForm, rememberChoices, resetAfterSave, toEntry, type FormState } from '../addForm'
  import { messages } from '../messages'
  import type { LatLng } from '../places'
  import EntryForm from './EntryForm.svelte'

  let { app }: { app: AppState } = $props()

  // svelte-ignore state_referenced_locally
  let form = $state<FormState>(initialForm(app.device, app.lists, undefined, app.year))
  let toast = $state('')
  // Lists arrive after the first sync; fill remembered defaults once they are known.
  // svelte-ignore state_referenced_locally
  let seeded = $state(app.lists.accounts.length > 0)
  $effect(() => {
    if (!seeded && app.lists.accounts.length > 0) {
      form = { ...initialForm(app.device, app.lists, undefined, app.year), amount: form.amount, currency: form.currency }
      seeded = true
    }
  })
  // Switching year moves the default date into that year (a date picked by hand is left alone).
  $effect(() => {
    const year = app.year
    untrack(() => {
      if (!form.date.startsWith(`${year}-`)) form = { ...form, date: initialForm(app.device, app.lists, undefined, year).date }
    })
  })

  async function onsubmit(f: FormState, coords: LatLng | null) {
    if (!app.canWrite) return
    const entry = toEntry(f, crypto.randomUUID())
    // Clear straight away so the next entry can be typed while this one is being stored.
    form = resetAfterSave(f)
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

<EntryForm bind:form lists={app.lists} history={app.displayed} device={app.device} year={app.year} submitLabel={messages.addSave} {onsubmit} />
{#if toast}<div class="toast" role="status">{toast}</div>{/if}
