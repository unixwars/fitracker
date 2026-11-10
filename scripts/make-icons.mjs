// Renders the PWA icons from assets/logo.svg. Run: node scripts/make-icons.mjs
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const svg = readFileSync(new URL('../assets/logo.svg', import.meta.url))
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname

// Transparent icons: the logo with a little breathing room.
for (const size of [192, 512]) {
  const inner = Math.round(size * 0.84)
  const logo = await sharp(svg, { density: 300 }).resize(inner, inner).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: logo, gravity: 'center' }]).png().toFile(out(`icon-${size}.png`))
}

// Maskable icon: solid background, logo inside the 80% safe zone so Android masks never clip it.
const size = 512
const inner = Math.round(size * 0.56)
const logo = await sharp(svg, { density: 300 }).resize(inner, inner).png().toBuffer()
await sharp({ create: { width: size, height: size, channels: 4, background: '#0e1418' } })
  .composite([{ input: logo, gravity: 'center' }]).png().toFile(out('icon-maskable-512.png'))

await sharp({ create: { width: 180, height: 180, channels: 4, background: '#0e1418' } })
  .composite([{ input: await sharp(svg, { density: 300 }).resize(120, 120).png().toBuffer(), gravity: 'center' }]).png().toFile(out('apple-touch-icon.png'))
console.log('icons written')
