// Account names are the user's own (Accounts tab), so emojis are picked by keyword with a generic fallback.
// First match wins; each pattern matches at the start of a word.
const RULES: [string, RegExp][] = [
  ['💵', /\b(cash|petty)/],
  ['💳', /\b(card|credit|debit|visa|mastercard|amex)/],
  ['🐷', /\b(saving|reserve|rainy)/],
  ['📈', /\b(invest|broker|stock|crypto|pension|fund)/],
  ['👛', /\b(wallet|revolut|wise|paypal|monzo|venmo)/],
  ['👥', /\b(joint|shared|family|household)/],
]

export const accountEmoji = (name: string) => RULES.find(([, re]) => re.test(name.trim().toLowerCase()))?.[0] ?? '🏦'
export const accountLabel = (name: string) => `${accountEmoji(name)} ${name}`
