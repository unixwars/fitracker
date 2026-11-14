// Account names are the user's own (Accounts tab), so emojis are picked by keyword with a generic fallback (a bank).
// First match wins; each pattern matches at the start of a word. Short names end in \b so "Stakeholder" is not "Stake".
export const BROKERS = {
  eu: ['degiro', 'trading ?212', 'flatex', 'scalable', 'trade republic', 'freedom24', 'xtb\\b', 'saxo', 'lynx\\b', 'bux\\b', 'bitpanda', 'swissquote', 'comdirect', 'consorsbank', 'onvista', 'justtrade', 'smartbroker', 'sbroker', 'ebase', 'directa', 'fineco', 'webank', 'copernico', 'etoro', 'plus500', 'capital\\.com', 'admiral', 'avatrade', 'pepperstone', 'tickmill', 'bolero', 'keytrade', 'binck', 'lightyear', 'nordnet', 'avanza', 'brokerjet', 'boursorama', 'bourse ?direct', 'cortal'],
  us: ['interactive brokers', 'ibkr', 'fidelity', 'schwab', 'vanguard', 'e\\*?trade', 'robinhood', 'webull', 'merrill', 'tastytrade', 'tastyworks', 'tradestation', 'firstrade', 'ameritrade', 'thinkorswim', 'moomoo', 'wealthfront', 'betterment', 'acorns', 'stash\\b', 'm1 finance', 'tradier', 'tradezero', 'lightspeed', 'ninjatrader', 'stockpile', 'ellevest', 'coinbase', 'kraken', 'binance'],
  uk: ['hargreaves', 'hl\\b', 'aj ?bell', 'freetrade', 'ig\\b', 'cmc\\b', 'nutmeg', 'moneybox', 'wealthify', 'moneyfarm', 'plum\\b', 'charles stanley', 'iweb', 'share ?dealing', 'willis ?owen', 'sippdeal', 'stocktrade', 'dodl', 'stake\\b', 'spreadex', 'city index', 'close brothers', 'wealthsimple', 'evelyn', 'rathbone', 'brewin', 'praemium', 'quilter', 'transact\\b', 'fundsmith'],
}
const brokers = [...BROKERS.eu, ...BROKERS.us, ...BROKERS.uk].join('|')

const RULES: [string, RegExp][] = [
  ['💵', /\b(cash|petty)/],
  ['💳', /\b(card|credit|debit|visa|mastercard|amex)/],
  ['🐷', /\b(saving|reserve|rainy)/],
  ['📈', new RegExp(`\\b(invest|broker|stock|crypto|pension|fund|${brokers})`)],
  ['👥', /\b(joint|shared|family|household)/],
]

export const accountEmoji = (name: string) => RULES.find(([, re]) => re.test(name.trim().toLowerCase()))?.[0] ?? '🏦'
export const accountLabel = (name: string) => `${accountEmoji(name)} ${name}`
