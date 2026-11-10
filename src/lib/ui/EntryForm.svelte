<script lang="ts">
  import { applySuggestion, categoriesFor, validate, type Errors, type FormState } from '../addForm'
  import type { DeviceSettings } from '../config'
  import { messages } from '../messages'
  import { nearestPlace, type LatLng } from '../places'
  import { suggest, type Suggestion } from '../predict'
  import { todayLocal, type Entry, type Kind } from '../rows'
  import { CURRENCIES, type Lists } from '../types'
  import { dateLabel } from './format'

  let {
    form = $bindable(),
    lists,
    history,
    device,
    submitLabel,
    onsubmit,
    lockKind = false,
  }: {
    form: FormState
    lists: Lists
    history: Entry[]
    device: DeviceSettings
    submitLabel: string
    onsubmit: (form: FormState, coords: LatLng | null) => void
    lockKind?: boolean
  } = $props()

  let errors = $state<Errors>({})
  let coords = $state<LatLng | null>(null)
  let gpsNote = $state('')
  let amountEl = $state<HTMLInputElement>()
  let dateEl = $state<HTMLInputElement>()

  const kinds: Kind[] = ['expense', 'income', 'transfer']
  const kindHistory = $derived(history.filter((e) => e.kind === form.kind))
  const categories = $derived(categoriesFor(form.kind, lists))
  const placeSuggestions = $derived(form.kind === 'expense' ? suggest('place', form.place, kindHistory) : [])
  const descSuggestions = $derived(form.description || form.kind !== 'expense' ? suggest('description', form.description, kindHistory) : [])

  $effect(() => { amountEl?.focus() })

  function pick(s: Suggestion, field: 'place' | 'description') {
    form = applySuggestion(form, s, lists, field)
  }

  function setKind(k: Kind) {
    form = { ...form, kind: k, category: '', toAccount: '' }
    errors = {}
  }

  function useLocation() {
    gpsNote = ''
    if (!navigator.geolocation) { gpsNote = messages.locationDenied; return }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        coords = { lat: p.coords.latitude, lng: p.coords.longitude }
        const name = nearestPlace(coords, device.places)
        if (name) form = { ...form, place: name }
        else gpsNote = messages.locationNone
      },
      () => { gpsNote = messages.locationDenied },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  function submit(ev: Event) {
    ev.preventDefault()
    errors = validate(form, lists)
    if (Object.keys(errors).length === 0) onsubmit(form, coords)
  }

  function openDate() {
    dateEl?.showPicker?.()
    dateEl?.focus()
  }

  const descLabel = $derived(form.kind === 'income' ? messages.descriptionIncome : form.kind === 'transfer' ? messages.descriptionTransfer : messages.description)
</script>

<form onsubmit={submit} novalidate>
  {#if !lockKind}
    <div class="seg" role="group" aria-label="Kind">
      {#each kinds as k (k)}
        <button type="button" aria-pressed={form.kind === k} onclick={() => setKind(k)}>{messages.kinds[k]}</button>
      {/each}
    </div>
  {/if}

  <div class="amount-row">
    <input bind:this={amountEl} bind:value={form.amount} inputmode="decimal" autocomplete="off" placeholder="0.00" aria-label={messages.amount} data-testid="amount" />
    <select bind:value={form.currency} aria-label={messages.currency} data-testid="currency">
      {#each CURRENCIES as c (c)}<option value={c}>{c}</option>{/each}
    </select>
  </div>
  {#if errors.amount}<p class="err">{messages.errors.amount}</p>{/if}

  {#if form.kind === 'expense'}
    <label class="field">
      <span>{messages.place}</span>
      <div class="row">
        <input bind:value={form.place} autocomplete="off" aria-label={messages.place} data-testid="place" />
        <button type="button" class="secondary fit" onclick={useLocation}>{messages.useLocation}</button>
      </div>
    </label>
    {#if gpsNote}<p class="muted">{gpsNote}</p>{/if}
    {#if placeSuggestions.length}
      <div class="chips scroll" data-testid="place-suggestions">
        {#each placeSuggestions as s (s.text)}
          <button type="button" class="chip" onclick={() => pick(s, 'place')}>{s.text}</button>
        {/each}
      </div>
    {/if}
  {/if}

  <label class="field">
    <span>{descLabel}</span>
    <input bind:value={form.description} autocomplete="off" aria-label={descLabel} data-testid="description" />
  </label>
  {#if descSuggestions.length}
    <div class="chips scroll">
      {#each descSuggestions as s (s.text)}
        <button type="button" class="chip" onclick={() => pick(s, 'description')}>{s.text}</button>
      {/each}
    </div>
  {/if}

  {#if form.kind !== 'transfer'}
    <h3>{messages.category}</h3>
    <div class="chips" data-testid="categories">
      {#each categories as c (c)}
        <button type="button" class="chip" aria-pressed={form.category === c} onclick={() => (form = { ...form, category: c })}>{c}</button>
      {/each}
    </div>
    {#if errors.category}<p class="err">{messages.errors.category}</p>{/if}
  {/if}

  <h3>{form.kind === 'transfer' ? messages.fromAccount : messages.account}</h3>
  <div class="chips" data-testid="accounts">
    {#each lists.accounts as a (a)}
      <button type="button" class="chip" aria-pressed={form.account === a} onclick={() => (form = { ...form, account: a })}>{a}</button>
    {/each}
  </div>
  {#if errors.account}<p class="err">{messages.errors.account}</p>{/if}

  {#if form.kind === 'transfer'}
    <h3>{messages.toAccount}</h3>
    <div class="chips">
      {#each lists.accounts as a (a)}
        <button type="button" class="chip" aria-pressed={form.toAccount === a} onclick={() => (form = { ...form, toAccount: a })}>{a}</button>
      {/each}
    </div>
    {#if errors.toAccount}<p class="err">{messages.errors.toAccount}</p>{/if}
  {/if}

  <div class="row" style="margin-bottom: 12px">
    <button type="button" class="secondary" onclick={openDate} data-testid="date-chip">
      {messages.date}: {form.date === todayLocal() ? messages.today : dateLabel(form.date)}
    </button>
    <input bind:this={dateEl} type="date" bind:value={form.date} aria-label={messages.date} style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;min-height:0;padding:0;border:0" tabindex="-1" />
  </div>

  <button class="primary" type="submit" data-testid="save">{submitLabel}</button>
</form>
