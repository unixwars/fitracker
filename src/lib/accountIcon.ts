// Account names are the user's own (Accounts tab), so emojis are picked by keyword with a generic fallback (a bank).
// First match wins; each pattern matches at the start of a word. Short names end in \b so "Stakeholder" is not "Stake".
export const BROKERS = {
  eu: ['degiro', 'trading ?212', 'flatex', 'scalable', 'trade republic', 'freedom24', 'xtb\\b', 'saxo', 'lynx\\b', 'bux\\b', 'bitpanda', 'swissquote', 'comdirect', 'consorsbank', 'onvista', 'justtrade', 'smartbroker', 'sbroker', 'ebase', 'directa', 'fineco', 'webank', 'copernico', 'etoro', 'plus500', 'capital\\.com', 'admiral', 'avatrade', 'pepperstone', 'tickmill', 'bolero', 'keytrade', 'binck', 'lightyear', 'nordnet', 'avanza', 'brokerjet', 'boursorama', 'bourse ?direct', 'cortal'],
  us: ['interactive brokers', 'ibkr', 'fidelity', 'schwab', 'vanguard', 'e\\*?trade', 'robinhood', 'webull', 'merrill', 'tastytrade', 'tastyworks', 'tradestation', 'firstrade', 'ameritrade', 'thinkorswim', 'moomoo', 'wealthfront', 'betterment', 'acorns', 'stash\\b', 'm1 finance', 'tradier', 'tradezero', 'lightspeed', 'ninjatrader', 'stockpile', 'ellevest', 'coinbase', 'kraken', 'binance'],
  uk: ['hargreaves', 'hl\\b', 'aj ?bell', 'freetrade', 'ig\\b', 'cmc\\b', 'nutmeg', 'moneybox', 'wealthify', 'moneyfarm', 'plum\\b', 'charles stanley', 'iweb', 'share ?dealing', 'willis ?owen', 'sippdeal', 'stocktrade', 'dodl', 'stake\\b', 'spreadex', 'city index', 'close brothers', 'wealthsimple', 'evelyn', 'rathbone', 'brewin', 'praemium', 'quilter', 'transact\\b', 'fundsmith'],
}
const brokers = [...BROKERS.eu, ...BROKERS.us, ...BROKERS.uk].join('|')

export type AccountIconName = 'cash' | 'card' | 'savings' | 'invest' | 'joint' | 'bank'
const EMOJI: Record<AccountIconName, string> = { cash: '💵', card: '💳', savings: '🐷', invest: '📈', joint: '👥', bank: '🏦' }
// 24x24 Material Design paths (monochrome), shown instead of the emoji where the browser can.
export const ACCOUNT_ICON_PATHS: Record<AccountIconName, string> = {
  cash: 'M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-9-1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-6v11c0 1.1-.9 2-2 2H4v-2h17V7h2z',
  card: 'M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z',
  savings: 'M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  invest: 'M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z',
  joint: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  bank: 'M4 10v7h3v-7H4zm6 0v7h3v-7h-3zM2 22h19v-3H2v3zm14-12v7h3v-7h-3zm-4.5-9L2 6v2h19V6l-9.5-5z',
}

const RULES: [AccountIconName, RegExp][] = [
  ['cash', /\b(cash|petty)/],
  ['card', /\b(card|credit|debit|visa|mastercard|amex)/],
  ['savings', /\b(saving|reserve|rainy)/],
  ['invest', new RegExp(`\\b(invest|broker|stock|crypto|pension|fund|${brokers})`)],
  ['joint', /\b(joint|shared|family|household)/],
]

export const accountIcon = (name: string): AccountIconName => RULES.find(([, re]) => re.test(name.trim().toLowerCase()))?.[0] ?? 'bank'
export const accountEmoji = (name: string) => EMOJI[accountIcon(name)]
