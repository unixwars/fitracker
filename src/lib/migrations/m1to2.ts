// 1 -> 2: any currency per entry. D becomes the amount as entered, a new last column holds the
// currency, and C becomes one array formula converting to the base currency.
import { FIRST_ROW, KINDS, SETUP, TABS, colIndex } from '../schema'
import type { SheetOp } from '../sheets/types'
import { CURRENCIES, type Currency } from '../types'
import type { Flagged, Migration } from './types'

const blank = (v: unknown) => v === undefined || v === null || v === ''
const isFormula = (v: unknown) => typeof v === 'string' && v.startsWith('=')
// The template's own GBP->EUR conversion (with or without the xlsx export wrapper).
const isTemplateConversion = (v: unknown) => typeof v === 'string' && /GOOGLEFINANCE\(\s*"{1,2}CURRENCY:GBPEUR"{1,2}\s*\)/i.test(v)

export function conversionFormula(currencyCol: string): string {
  const c = `${currencyCol}10:${currencyCol}`
  return `=ARRAYFORMULA(IF(D10:D="","",D10:D*IF(${c}="GBP",Setup!$U$17,IF(${c}="USD",Setup!$U$18,IF(${c}="EUR",Setup!$U$16,1)))))`
}

export const m1to2: Migration = {
  from: 1,
  to: 2,
  plan(state, ctx) {
    const ops: SheetOp[] = []
    const flagged: Flagged[] = []
    for (const kind of KINDS) {
      const { name, cols, headersV2 } = TABS[kind]
      const [cI, dI] = [colIndex(cols.base), colIndex(cols.amount)]
      const amounts: unknown[][] = []
      const currencies: unknown[][] = []
      state.rows[kind].forEach((row, i) => {
        const c = row[cI]
        const d = row[dI]
        const sheetRow = FIRST_ROW + i
        const flag = (reason: string) => flagged.push({ kind, row: sheetRow, reason })
        let amount: unknown = ''
        let currency: unknown = ''
        if (typeof c === 'number') {
          amount = c // typed over the conversion formula in the template's euro column
          currency = 'EUR'
        } else if (!blank(c) && !isTemplateConversion(c)) {
          flag(isFormula(c) ? 'Column C holds a custom formula' : 'Column C holds text')
        } else if (typeof d === 'number') {
          amount = d
          currency = 'GBP'
        } else if (!blank(d)) {
          flag('Column D holds text instead of an amount')
        }
        amounts.push([amount])
        currencies.push([currency])
      })
      ops.push({ t: 'set', range: `${name}!B9:${cols.currency}9`, values: [headersV2] })
      if (amounts.length) {
        const last = FIRST_ROW + amounts.length - 1
        ops.push({ t: 'set', range: `${name}!D${FIRST_ROW}:D${last}`, values: amounts })
        ops.push({ t: 'set', range: `${name}!${cols.currency}${FIRST_ROW}:${cols.currency}${last}`, values: currencies })
      }
      ops.push({ t: 'clear', range: `${name}!C${FIRST_ROW}:C` })
      ops.push({ t: 'set', range: `${name}!C${FIRST_ROW}`, values: [[conversionFormula(cols.currency)]] })
      ops.push({ t: 'listValidation', range: `${name}!${cols.currency}${FIRST_ROW}:${cols.currency}`, values: [...CURRENCIES] })
      ops.push({ t: 'numberFormat', range: `${name}!D${FIRST_ROW}:D`, pattern: '#,##0.00' })
      if (ctx.baseCurrency !== 'EUR') ops.push({ t: 'numberFormat', range: `${name}!C${FIRST_ROW}:C`, pattern: '#,##0.00' })
    }
    const rateFormula = (c: Currency, row: number) => (c === ctx.baseCurrency ? 1 : `=GOOGLEFINANCE("CURRENCY:"&T${row}&$U$8)`)
    ops.push({ t: 'set', range: SETUP.baseLabel, values: [['Base currency']] })
    ops.push({ t: 'set', range: SETUP.baseCurrency, values: [[ctx.baseCurrency]] })
    ops.push({ t: 'set', range: SETUP.rateRange, values: CURRENCIES.map((c, i) => [c, rateFormula(c, 16 + i)]) })
    return { ops, flagged }
  },
}
