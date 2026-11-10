export const CURRENCIES = ['EUR', 'GBP', 'USD'] as const
export type Currency = (typeof CURRENCIES)[number]
export type Money = { minor: number; currency: Currency }
