import { describe, expect, it } from 'vitest'
import { newIssueUrl, PROJECT_URL } from './projectLinks'

describe('newIssueUrl', () => {
  it('opens a new issue on the project with only the version prefilled', () => {
    const url = new URL(newIssueUrl('0.2.1 (abc1234)'))
    expect(url.origin + url.pathname).toBe(`${PROJECT_URL}/issues/new`)
    expect(url.searchParams.get('body')).toBe('App version: 0.2.1 (abc1234)\n\n')
  })
})
