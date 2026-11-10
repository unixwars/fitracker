import { describe, expect, it } from 'vitest'
import { nearestPlace } from './places'

const known = [
  { name: 'Tesco', lat: 51.5007, lng: -0.1246 },
  { name: 'Cafe', lat: 51.5033, lng: -0.1195 },
]

describe('nearestPlace', () => {
  it('returns the nearest known place within range', () => {
    expect(nearestPlace({ lat: 51.5008, lng: -0.1245 }, known)).toBe('Tesco')
    expect(nearestPlace({ lat: 51.5032, lng: -0.1196 }, known)).toBe('Cafe')
  })
  it('returns null when nothing is within range', () => {
    expect(nearestPlace({ lat: 52.0, lng: 0.0 }, known)).toBeNull()
    expect(nearestPlace({ lat: 51.5008, lng: -0.1245 }, [])).toBeNull()
  })
  it('respects a custom max distance', () => {
    expect(nearestPlace({ lat: 51.5025, lng: -0.1246 }, known, 50)).toBeNull()
    expect(nearestPlace({ lat: 51.5025, lng: -0.1246 }, known, 500)).toBe('Tesco')
  })
})
