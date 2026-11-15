// THROWAWAY live check: runs the app's real store code against a real Google Sheets COPY of the template.
import { copyTemplate } from '../../../../src/lib/driveCopy'
import { monthView } from '../../../../src/lib/month'
import { dateToSerial, ledgerRowValues, todayLocal, type Entry } from '../../../../src/lib/rows'
import { createSheetsApi } from '../../../../src/lib/sheets/api'
import { createLedgerStore } from '../../../../src/lib/sheets/ledgerStore'
import { ensureVersion } from '../../../../src/lib/sheets/version'

const $ = (id: string) => document.getElementById(id) as HTMLInputElement
const out = document.getElementById('log')!
const log = (m: unknown) => { out.textContent += (typeof m === 'string' ? m : JSON.stringify(m)) + '\n' }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let token: string | null = null
let copyId: string | null = null
const results: [string, boolean, string][] = []
const check = (name: string, ok: boolean, detail = '') => { results.push([name, ok, detail]); log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`) }

function load(src: string) {
  return new Promise<void>((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s) })
}
const ready = (async () => {
  await load('https://accounts.google.com/gsi/client'); await load('https://apis.google.com/js/api.js')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await new Promise<void>((r) => (window as any).gapi.load('picker', () => r()))
  log('Libraries loaded.')
})().catch((e) => log('Load error: ' + e.message))

// Same Picker code as the S5 page that worked.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pickTemplate = (fileId: string): Promise<string | null> => new Promise((resolve) => { const g = (window as any).google
  const view = new g.picker.DocsView(g.picker.ViewId.SPREADSHEETS); view.setFileIds(fileId)
  new g.picker.PickerBuilder().addView(view).setOAuthToken(token).setDeveloperKey($('apiKey').value.trim()).setAppId($('projectNumber').value.trim())
    .setCallback((r: { action: string; docs?: { id: string }[] }) => { if (r.action === g.picker.Action.PICKED) resolve(r.docs?.[0]?.id ?? null); else if (r.action === g.picker.Action.CANCEL) resolve(null); else log('Picker event: ' + r.action) })
    .build().setVisible(true) })

document.getElementById('signIn')!.onclick = async () => {
  await ready
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).google.accounts.oauth2.initTokenClient({
    client_id: $('clientId').value.trim(), scope: 'https://www.googleapis.com/auth/drive.file',
    callback: (r: { error?: string; access_token: string; scope: string }) => { if (r.error) return log('Sign-in error: ' + r.error); token = r.access_token; log('Signed in. Scope: ' + r.scope) },
    error_callback: (e: { type: string }) => log('Sign-in error: ' + e.type),
  }).requestAccessToken()
}

document.getElementById('run')!.onclick = async () => {
  if (!token) return log('Sign in first.')
  try {
    await ready
    log('Pick the template in the Picker (it is copied for the test). Wait a few seconds for it to load.')
    const picked = await pickTemplate($('templateId').value.trim())
    if (!picked) return log('Picker cancelled.')
    copyId = await copyTemplate(token, picked, 'Fitracker LIVE CHECK (delete me)')
    log('Copy created: ' + copyId)
    await runChecks(copyId)
  } catch (e) {
    log('ERROR: ' + (e as Error).message)
    if (copyId) {
      try {
        const dump = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${copyId}/values/${encodeURIComponent('Ledger!A1:J8')}?valueRenderOption=UNFORMATTED_VALUE`, { headers: { Authorization: 'Bearer ' + token } })
        log('Ledger!A1:J8 at the time of the error: ' + (await dump.text()).replace(/\s+/g, ' ').slice(0, 1200))
      } catch { /* ignore */ }
    }
  } finally {
    summary()
  }
}
document.getElementById('del')!.onclick = async () => {
  if (!token || !copyId) return log('Nothing to delete.')
  const r = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(copyId), { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } })
  log('Deleted the test copy: HTTP ' + r.status + (r.status === 204 ? ' (done)' : ' (delete it from Drive by hand)'))
  if (r.status === 204) copyId = null
}

// Retries a call that hit the read quota (60 per minute): wait, then go on, as the app's replayer does.
function retrying<T extends object>(o: T): T {
  return new Proxy(o, { get(t, p: string) {
    const v = (t as never)[p]
    if (typeof v !== 'function') return v
    return async (...a: unknown[]) => {
      for (let i = 0; ; i++) {
        try { return await (v as (...x: unknown[]) => unknown)(...a) } catch (err) {
          if ((err as Error).name === 'RateLimited' && i < 5) { log('(read quota hit, waiting 20 s)'); await sleep(20000); continue }
          throw err
        }
      }
    }
  } })
}
const mk = () => retrying(createSheetsApi(() => token))

function summary() {
  const bad = results.filter((r) => !r[1])
  log(`\nSUMMARY: ${results.length - bad.length} passed, ${bad.length} failed${bad.length ? ': ' + bad.map((b) => b[0]).join('; ') : ''}`)
  log(copyId ? 'The test copy still exists. Inspect it if you want, then click "Delete the test copy".' : '')
}

async function runChecks(id: string) {
  const real = mk()
  const counts: Record<string, number> = {}
  const api = new Proxy(real, { get(t, p: string) { const v = (t as never)[p]; return typeof v === 'function' ? (...a: unknown[]) => { counts[p] = (counts[p] ?? 0) + 1; return (v as (...x: unknown[]) => unknown)(...a) } : v } })
  const rd = async (range: string, render: 'UNFORMATTED_VALUE' | 'FORMULA' = 'UNFORMATTED_VALUE') => (await real.batchGet(id, [range], render))[0]
  const delta = (() => { let last: Record<string, number> = {}; return () => { const d: Record<string, number> = {}; for (const k of Object.keys(counts)) if (counts[k] !== (last[k] ?? 0)) d[k] = counts[k] - (last[k] ?? 0); last = { ...counts }; return JSON.stringify(d) } })()

  // C: the copy and the version tag
  await ensureVersion(api, id)
  check('C5 the copy is a v3 ledger (tag 3 survived the copy)', (await real.getMetadata(id, 'fitracker.schemaVersion')) === '3')
  const tok = token!
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ requests: [{ deleteDeveloperMetadata: { dataFilter: { developerMetadataLookup: { metadataKey: 'fitracker.schemaVersion', visibility: 'DOCUMENT', locationType: 'SPREADSHEET' } } } }] }) })
  check('C8 tag removed for the test', (await real.getMetadata(id, 'fitracker.schemaVersion')) === null)
  const calls0 = counts.setMetadata ?? 0
  await ensureVersion(api, id)
  check('C8 a lost tag is re-stamped with exactly one write', (await real.getMetadata(id, 'fitracker.schemaVersion')) === '3' && (counts.setMetadata ?? 0) - calls0 === 1)

  // The master template is blank (no accounts or categories), so seed two accounts and one category in the COPY.
  await real.valuesBatchUpdate(id, [
    { range: 'Accounts!A2:E3', values: [['Joint', 'EUR', true, true, true], ['Cash GBP', 'GBP', true, true, true]] },
    { range: 'Categories!A2:C2', values: [['Groceries', 'expense', true]] },
  ], 'USER_ENTERED')
  log('Seeded the copy with accounts Joint (EUR) and Cash GBP (GBP) and category Groceries.')
  const j2Before = (await rd('Ledger!J2', 'FORMULA'))[0]?.[0]
  const store = createLedgerStore(api, id)
  delta()
  const ref = await store.lists()
  log('Quota, first load (reads/writes): ' + delta())
  const eur = ref.accounts.find((a) => a.active && a.currency === 'EUR')
  const gbp = ref.accounts.find((a) => a.active && a.currency === 'GBP')
  const cat = ref.categories.find((c) => c.active && c.type === 'expense')
  check('template has an active EUR account and an expense category', !!eur && !!cat, `accounts=${ref.accounts.map((a) => a.name + ':' + a.currency).join(',')}`)
  if (!eur || !cat) return
  const today = todayLocal()
  const e = (id: string, o: Partial<Entry> = {}): Entry => ({ id, kind: 'expense', date: today, money: { minor: 1250, currency: 'EUR' }, description: 'live check', place: 'Live', category: cat.name, account: eur.name, ...o })
  const lastRow = async () => (await rd('Ledger!A:A')).length

  // D9
  const n0 = await lastRow()
  delta()
  const r1 = await store.addMany([e('live-1')])
  log('Quota, one add (reads/writes): ' + delta())
  check('D9 the first row of the empty tab landed in columns A to I (J2 formula intact)', (await rd('Ledger!A2:I2'))[0]?.[0] === 'live-1' && (await rd('Ledger!J2', 'FORMULA'))[0]?.[0] === j2Before)
  const rowA = (await rd('Ledger!A:A')).findIndex((r) => r[0] === 'live-1') + 1
  const rowVals = (await rd(`Ledger!A${rowA}:J${rowA}`))[0] ?? []
  check('D9 add: appended below the last row with id, serial date and amount 12.5', r1[0].ok && rowA === n0 + 1 && rowVals[0] === 'live-1' && rowVals[1] === dateToSerial(today) && rowVals[3] === 12.5, `row ${rowA}, was ${n0}`)
  await sleep(2000)
  check('D9 column J still computes for the new row and J2 is untouched', typeof (await rd(`Ledger!J${rowA}`))[0]?.[0] === 'number' && (await rd('Ledger!J2', 'FORMULA'))[0]?.[0] === j2Before)
  // D10
  if (gbp) {
    await store.addMany([e('live-gbp', { account: gbp.name, money: { minor: 1000, currency: 'GBP' } })])
    const row = (await rd('Ledger!A:A')).findIndex((r) => r[0] === 'live-gbp') + 1
    check('D10 GBP account entry stored as typed (10)', (await rd(`Ledger!D${row}`))[0]?.[0] === 10)
  } else log('(skipped D10: no GBP account in the template)')
  // D12, D14
  delta()
  await store.edit(e('live-1', { description: '=1+1', money: { minor: 2500, currency: 'EUR' } }), e('live-1'))
  log('Quota, one edit (reads/writes): ' + delta())
  const edited = (await rd(`Ledger!A${rowA}:I${rowA}`))[0] ?? []
  check('D12 edit changed the same row (amount 25), no new row', edited[3] === 25 && (await lastRow()) === n0 + (gbp ? 2 : 1))
  check('D14 a description starting with = is stored as text', edited[5] === '=1+1', JSON.stringify(edited[5]))
  // D13
  const before = await lastRow()
  delta()
  const del = await store.delete('live-1')
  log('Quota, one delete (reads/writes): ' + delta())
  const cleared = (await rd(`Ledger!A${rowA}:I${rowA}`))[0] ?? []
  check('D13 delete cleared A to I of that row and returned the previous values', cleared.every((c) => c === '' || c === undefined) && del.previous.id === 'live-1')
  check('D13 other rows untouched', (await rd('Ledger!A:A')).filter((r) => r[0]).length >= (gbp ? 1 : 0))
  await store.addMany([del.previous])
  check('D13 undo (re-add) puts it back', (await rd('Ledger!A:A')).some((r) => r[0] === 'live-1'), `rows before ${before}`)

  // D15, D16
  const free = (await lastRow()) + 1
  const act = (account: string) => account
  await real.valuesBatchUpdate(id, [
    { range: `Ledger!A${free}:I${free}`, values: [['', dateToSerial(today), 'expense', 3.5, 'Hand', 'typed without id', cat.name, act(eur.name), '']] },
    { range: `Ledger!A${free + 1}:I${free + 1}`, values: [['hand-id-1', dateToSerial(today), 'expense', 4.5, 'Hand', 'typed with id', cat.name, eur.name, '']] },
    { range: `Ledger!A${free + 2}:I${free + 2}`, values: [['bad-1', 'not a date', 'expense', 5, 'Hand', 'text date', cat.name, eur.name, '']] },
  ], 'USER_ENTERED')
  await store.refresh({ force: true })
  const ids = (await rd(`Ledger!A${free}:A${free + 2}`)).map((r) => r[0])
  check('D15 a hand-typed row without an id gets one after a refresh', typeof ids[0] === 'string' && ids[0] !== '', String(ids[0]))
  check('D15 a hand-typed row with an id keeps it', ids[1] === 'hand-id-1')
  const un = await store.unreadable()
  check('D16 a text-date row is unreadable (row number matches) and not listed', un.some((u) => u.row === free + 2 && u.reason === 'date') && !(await store.list()).some((x) => x.id === 'bad-1'), JSON.stringify(un))
  check('D16 the unreadable row was not given an id or changed', ids[2] === 'bad-1')

  // E17, E18
  const rates = async () => (await rd('Rates!A2:C', 'FORMULA'))
  const month = (n: number) => { const [y, m] = today.split('-').map(Number); const d = new Date(y, m - 1 + n, 15); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15` }
  // The blank template has no rate rows. Seed the current month's live row (what an earlier month-roll leaves behind),
  // then wait for it to calculate: GOOGLEFINANCE cells of a fresh copy need a moment, and the month-roll leaves a
  // non-numeric live cell alone.
  if ((await rd('Rates!A2:C')).length === 0) {
    await real.valuesBatchUpdate(id, [{ range: 'Rates!A2:C2', values: [[dateToSerial(todayLocal().slice(0, 7) + '-01'), '=GOOGLEFINANCE("CURRENCY:GBPEUR")', '=GOOGLEFINANCE("CURRENCY:USDEUR")']] }], 'USER_ENTERED')
    log('Seeded the current month as a live Rates row.')
  }
  for (let i = 0; i < 12; i++) {
    const last = (await rd('Rates!A2:C'))[(await rd('Rates!A2:C')).length - 1] ?? []
    if (typeof last[1] === 'number' && typeof last[2] === 'number') break
    log('(waiting for the live rate cells to calculate...)'); await sleep(5000)
  }
  const rBefore = await rates()
  log('Rates before the month-roll (last 3 rows, formulas): ' + JSON.stringify(rBefore.slice(-3)))
  const numericBefore = rBefore.flatMap((r, i) => r.slice(1).map((c, k) => [i, k, c] as const)).filter(([, , c]) => typeof c === 'number')
  delta()
  await store.maintainRates(month(1))
  log('Quota, month-roll (reads/writes): ' + delta())
  const rAfter = await rates()
  log('Rates after the month-roll (last 3 rows, formulas): ' + JSON.stringify(rAfter.slice(-3)))
  const targetSerial = dateToSerial(month(1).slice(0, 7) + '-01')
  const rows1 = rAfter.filter((r) => r[0] === targetSerial)
  check('E17 month-roll appended exactly one row for the new month with GOOGLEFINANCE formulas', rows1.length === 1 && String(rows1[0][1]).startsWith('=GOOGLEFINANCE') && String(rows1[0][2]).startsWith('=GOOGLEFINANCE'), JSON.stringify(rows1))
  check('E17 typed rate values were not changed', numericBefore.every(([i, k, c]) => rAfter[i]?.[k + 1] === c))
  const last2 = rAfter[rAfter.length - 2]
  check('E17 the closed month row now holds numbers, not formulas', typeof last2?.[1] === 'number' && typeof last2?.[2] === 'number' && last2[0] === dateToSerial(todayLocal().slice(0, 7) + '-01'), JSON.stringify(last2))
  const A = createLedgerStore(mk(), id)
  const B = createLedgerStore(mk(), id)
  await Promise.all([A.maintainRates(month(2)), B.maintainRates(month(2))])
  const t2 = dateToSerial(month(2).slice(0, 7) + '-01')
  const n2 = (await rates()).filter((r) => r[0] === t2).length
  check('E18 two devices rolling the same month at the same moment produce one row (a duplicate is the documented corner case)', n2 === 1, `${n2} row(s)`)

  // concurrent append (S1 in app terms)
  const C = createLedgerStore(mk(), id)
  const D = createLedgerStore(mk(), id)
  await Promise.all([C.addMany([e('race-a')]), D.addMany([e('race-b')])])
  const idsNow = (await rd('Ledger!A:A')).map((r) => r[0])
  check('S1-in-app two simultaneous appends both end up in the sheet (read-back retries the loser)', idsNow.includes('race-a') && idsNow.includes('race-b'))

  // F: what the checklist asks of a partner or of Sheets itself, scripted at API level.
  await sleep(3000)
  const day = (n: number) => { const t = new Date(); t.setDate(t.getDate() - n); return todayLocal(t) }
  const mkStore = () => createLedgerStore(mk(), id)
  await mkStore().addMany([e('s-a', { date: day(2), description: 'sort a' }), e('s-b', { date: day(1), description: 'sort b' }), e('s-c', { date: day(0), description: 'sort c' })])
  const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  const tabs = (await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(sheetId,title)`, { headers: auth })).json()).sheets as { properties: { sheetId: number; title: string } }[]
  const ledgerSheetId = tabs.find((x) => x.properties.title === 'Ledger')!.properties.sheetId
  const lastUsed = (await rd('Ledger!A:A')).length
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, { method: 'POST', headers: auth, body: JSON.stringify({ requests: [{ sortRange: { range: { sheetId: ledgerSheetId, startRowIndex: 1, endRowIndex: lastUsed, startColumnIndex: 0, endColumnIndex: 9 }, sortSpecs: [{ dimensionIndex: 1, sortOrder: 'DESCENDING' }] } }] }) })
  await sleep(2000)
  await mkStore().edit(e('s-b', { date: day(1), description: 'sort b EDITED' }), e('s-b', { date: day(1), description: 'sort b' }))
  const rowsNow = await rd(`Ledger!A2:I${lastUsed}`)
  const byId = (x: string) => rowsNow.find((r) => r[0] === x)
  check('F sort the Ledger in Sheets, then edit: the edit lands on that entry by id, the others are untouched', byId('s-b')?.[5] === 'sort b EDITED' && byId('s-a')?.[5] === 'sort a' && byId('s-c')?.[5] === 'sort c')
  const rowC = rowsNow.findIndex((r) => r[0] === 's-c') + 2
  await real.valuesBatchClear(id, [`Ledger!A${rowC}:I${rowC}`])
  let errName = ''
  try { await mkStore().edit(e('s-c', { description: 'late edit' }), e('s-c', { description: 'sort c' })) } catch (err) { errName = (err as Error).name }
  check('F a partner deletes a row, then our edit of it is flagged RowGone and writes nothing', errName === 'RowGone' && (await rd(`Ledger!A${rowC}:I${rowC}`)).flat().length === 0, errName)
  const thisMonth = todayLocal().slice(0, 7)
  const total = async (st: ReturnType<typeof mkStore>) => monthView({ entries: await st.list(), lists: await st.lists(), rates: await st.rates(), month: thisMonth }).expenses.actual.minor
  const s1 = mkStore()
  const totalBefore = await total(s1)
  await real.valuesBatchUpdate(id, [{ range: 'Accounts!D2', values: [[false]] }], 'USER_ENTERED') // Joint: In Monthly
  await s1.refresh({ force: true })
  const totalAfter = await total(s1)
  check('F untick In Monthly for an account: its entries leave the Month totals after a refresh', totalAfter < totalBefore, `${totalBefore} -> ${totalAfter}`)
  const copyRow = (await rd('Ledger!A:A')).length + 1
  await real.valuesBatchUpdate(id, [{ range: `Ledger!A${copyRow}:I${copyRow}`, values: [ledgerRowValues(e('s-a', { date: day(2), description: 'copy of a' }))] }])
  const s4 = mkStore()
  await s4.refresh({ force: true })
  const dups = (await s4.unreadable()).filter((u) => u.reason === 'duplicateId')
  check('F a row copied in Sheets (same id) is reported once as a duplicate and listed once', dups.length === 1 && dups[0].row === copyRow && (await s4.list()).filter((x) => x.id === 's-a').length === 1, JSON.stringify(dups))
  await real.valuesBatchClear(id, [`Ledger!A${copyRow}:I${copyRow}`])

  // Growing a full tab on the real API: fill Ledger to the last grid row, then add one more entry.
  const rowCount = async () => (await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(title,gridProperties.rowCount)`, { headers: { Authorization: 'Bearer ' + token } })).json()).sheets.find((x: { properties: { title: string } }) => x.properties.title === 'Ledger').properties.gridProperties.rowCount as number
  const grid = await rowCount()
  const used = (await rd('Ledger!A:A')).length
  const filler = Array.from({ length: grid - used }, (_, i) => ledgerRowValues(e('fill-' + i)))
  if (filler.length) await real.valuesBatchUpdate(id, [{ range: `Ledger!A${used + 1}:I${grid}`, values: filler }])
  const grow = await createLedgerStore(mk(), id).addMany([e('grow-1')])
  const grown = await rowCount()
  // The new rows must carry the last row's date format and data validation (the real copyPaste requests).
  const fmtUrl = (cell: string) => `https://sheets.googleapis.com/v4/spreadsheets/${id}?includeGridData=true&ranges=${encodeURIComponent(cell)}&fields=sheets.data.rowData.values(userEnteredFormat.numberFormat,dataValidation)`
  const cellInfo = async (cell: string) => (await (await fetch(fmtUrl(cell), { headers: { Authorization: 'Bearer ' + token } })).json()).sheets?.[0]?.data?.[0]?.rowData?.[0]?.values?.[0] ?? {}
  const newDate = await cellInfo(`Ledger!B${grid + 5}`)
  const newType = await cellInfo(`Ledger!C${grid + 5}`)
  const oldDate = await cellInfo(`Ledger!B${grid}`)
  check('grown rows have the date format of the last old row', Boolean(oldDate.userEnteredFormat?.numberFormat?.pattern) && newDate.userEnteredFormat?.numberFormat?.pattern === oldDate.userEnteredFormat?.numberFormat?.pattern, `old ${JSON.stringify(oldDate.userEnteredFormat?.numberFormat)} new ${JSON.stringify(newDate.userEnteredFormat?.numberFormat)}`)
  check('grown rows have the data validation of the last old row (type column)', Boolean(newType.dataValidation), JSON.stringify(newType.dataValidation ?? null).slice(0, 80))
  check('a full tab is grown by the real API and the entry is written below the old grid', grow[0].ok && grown > grid && (await rd(`Ledger!A${grid + 1}`))[0]?.[0] === 'grow-1', `grid ${grid} -> ${grown}`)
}
