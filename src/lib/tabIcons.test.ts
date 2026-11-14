import { describe, expect, it } from 'vitest'
import type { Tab } from './app.svelte'
import { TAB_ICON_PATHS } from './tabIcons'

describe('dock icons', () => {
  it('has one path for every tab', () => {
    const tabs: Tab[] = ['add', 'month', 'activity', 'settings']
    expect(Object.keys(TAB_ICON_PATHS).sort()).toEqual([...tabs].sort())
    for (const t of tabs) expect(TAB_ICON_PATHS[t].startsWith('M')).toBe(true)
  })
})
