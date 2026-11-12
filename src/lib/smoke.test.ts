import { describe, expect, it } from 'vitest'
import { messages } from './messages'

describe('messages', () => {
  it('has a non-empty save label', () => {
    expect(messages.addSave.length).toBeGreaterThan(0)
  })
})
