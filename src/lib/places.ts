export type LatLng = { lat: number; lng: number }
export type KnownPlace = LatLng & { name: string }

const R = 6_371_000
const rad = (d: number) => (d * Math.PI) / 180

export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function nearestPlace(pos: LatLng, known: KnownPlace[], maxMeters = 150): string | null {
  let best: string | null = null
  let bestD = maxMeters
  for (const k of known) {
    const d = distanceMeters(pos, k)
    if (d <= bestD) {
      best = k.name
      bestD = d
    }
  }
  return best
}
