<script lang="ts">
  import { tick } from 'svelte'
  import { accountNames, applySuggestion, categoriesFor, chooseAccount, convertedAmount, currencyIssue, switchKind, validate, type Errors, type FormState } from '../addForm'
  import type { DeviceSettings } from '../config'
  import { messages } from '../messages'
  import { nearestPlace, shouldAutoLocate, type LatLng } from '../places'
  import { suggest, usualAmounts, type Suggestion } from '../predict'
  import { todayLocal, type Entry, type Kind } from '../rows'
  import { CURRENCIES, type RateRow, type Reference } from '../types'
  import { cleanAmountInput, formatMoney } from '../money'
  import { dateLabel } from './format'

  let {
    form = $bindable(),
    lists,
    rates,
    history,
    device,
    submitLabel,
    onsubmit,
    lockKind = false,
  }: {
    form: FormState
    lists: Reference
    rates: RateRow[]
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
  const accounts = $derived(accountNames(lists))
  const issue = $derived(currencyIssue(form, lists))
  const converted = $derived(issue ? convertedAmount(form, lists, rates) : null)
  const placeSuggestions = $derived(form.kind === 'expense' ? suggest('place', form.place, kindHistory) : [])
  const amounts = $derived(form.amount.trim() === '' ? usualAmounts(form.place, kindHistory) : [])
  const descSuggestions = $derived(form.description || form.kind !== 'expense' ? suggest('description', form.description, kindHistory) : [])

  $effect(() => { amountEl?.focus() })

  // Quietly fill the place from GPS when permission was already granted on this device.
  $effect(() => {
    if (form.kind !== 'expense' || form.place || !navigator.permissions?.query) return
    navigator.permissions.query({ name: 'geolocation' }).then((st) => {
      if (shouldAutoLocate(st.state, device.places) && !form.place) useLocation(true)
    }, () => {})
  })

  function pick(s: Suggestion, field: 'place' | 'description') {
    form = applySuggestion(form, s, lists, field)
    // Everything needed is filled: close the keyboard so Save is in view.
    if (field === 'place' && form.category && form.account) (document.activeElement as HTMLElement | null)?.blur()
  }

  function setKind(k: Kind) {
    form = switchKind(form, k, device, lists)
    errors = {}
  }

  function useLocation(quiet = false) {
    gpsNote = ''
    if (!navigator.geolocation) { if (!quiet) gpsNote = messages.locationDenied; return }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        coords = { lat: p.coords.latitude, lng: p.coords.longitude }
        const name = nearestPlace(coords, device.places)
        if (name) form = { ...form, place: name }
        else if (!quiet) gpsNote = messages.locationNone
      },
      () => { if (!quiet) gpsNote = messages.locationDenied },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  function submit(ev: Event) {
    ev.preventDefault()
    errors = validate(form, lists, rates)
    if (Object.keys(errors).length === 0) { onsubmit(form, coords); return }
    tick().then(() => {
      if (errors.amount) amountEl?.focus()
      else document.querySelector('form .err')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
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
    <input bind:this={amountEl} value={form.amount} oninput={(e) => { const v = cleanAmountInput(e.currentTarget.value); e.currentTarget.value = v; form = { ...form, amount: v, convertConfirmed: false } }} inputmode="decimal" autocomplete="off" placeholder="0.00" aria-label={messages.amount} data-testid="amount" />
    <select bind:value={form.currency} onchange={() => (form = { ...form, convertConfirmed: false })} aria-label={messages.currency} data-testid="currency">
      {#each CURRENCIES as c (c)}<option value={c}>{c}</option>{/each}
    </select>
  </div>
  {#if amounts.length}
    <div class="chips" data-testid="usual-amounts">
      {#each amounts as m (m.currency + m.minor)}
        <button type="button" class="chip" onclick={() => (form = { ...form, amount: (m.minor / 100).toFixed(2), currency: m.currency })}>{formatMoney(m)}</button>
      {/each}
    </div>
  {/if}
  {#if errors.amount}<p class="err">{messages.errors.amount}</p>{/if}
  {#if issue}
    <div class="banner warn" data-testid="currency-warning">
      {#if converted}
        <p>{messages.currencyWarning(issue.input, issue.account, formatMoney(converted))}</p>
        {#if !form.convertConfirmed}
          <button type="button" class="secondary" data-testid="convert-confirm" onclick={() => (form = { ...form, convertConfirmed: true })}>{messages.convertAndKeep}</button>
        {/if}
      {:else}
        <p>{messages.noRateForMonth(issue.input)}</p>
      {/if}
    </div>
    {#if errors.currency && !errors.rate}<p class="err">{messages.errors.currency}</p>{/if}
  {/if}

  {#if form.kind === 'expense'}
    <label class="field">
      <span>{messages.place}</span>
      <div class="row">
        <input bind:value={form.place} autocomplete="off" aria-label={messages.place} data-testid="place" />
        <button type="button" class="secondary fit" onclick={() => useLocation()} aria-label={messages.locationAria}>
            <svg class="pin" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/></svg>
            {messages.useLocation}
          </button>
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
    <label class="field">
      <span>{messages.category}</span>
      <select value={form.category} onchange={(e) => (form = { ...form, category: e.currentTarget.value })} aria-label={messages.category} data-testid="categories">
        <option value="">{messages.choose}</option>
        {#if form.category && !categories.includes(form.category)}<option value={form.category}>{form.category}</option>{/if}
        {#each categories as c (c)}<option value={c}>{c}</option>{/each}
      </select>
    </label>
    {#if errors.category}<p class="err">{messages.errors.category}</p>{/if}
  {/if}

  <label class="field">
    <span>{form.kind === 'transfer' ? messages.fromAccount : messages.account}</span>
    <select value={form.account} onchange={(e) => (form = chooseAccount(form, e.currentTarget.value, lists))} aria-label={form.kind === 'transfer' ? messages.fromAccount : messages.account} data-testid="accounts">
      <option value="">{messages.choose}</option>
      {#if form.account && !accounts.includes(form.account)}<option value={form.account}>{form.account}</option>{/if}
      {#each accounts as a (a)}<option value={a}>{a}</option>{/each}
    </select>
  </label>
  {#if errors.account}<p class="err">{messages.errors.account}</p>{/if}

  {#if form.kind === 'transfer'}
    <label class="field">
      <span>{messages.toAccount}</span>
      <select value={form.toAccount} onchange={(e) => (form = { ...form, toAccount: e.currentTarget.value })} aria-label={messages.toAccount} data-testid="to-account">
        <option value="">{messages.choose}</option>
        {#each accounts as a (a)}<option value={a}>{a}</option>{/each}
      </select>
    </label>
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
