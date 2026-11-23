import test from 'node:test'
import assert from 'node:assert/strict'
import { code128Widths } from '../src/lib/codes.js'
import { scanCode128 } from '../src/lib/code128Scan.js'

// Fabrique une image RGBA : le code-barres est dessiné (module de `mod` pixels), avec marge, flou léger et bruit.
function image(text, { mod = 2, W = 640, H = 360, rev = false, noise = 0, vertical = false } = {}) {
  let widths = code128Widths(text)
  if (rev) widths = widths.slice().reverse()
  const total = widths.reduce((a, b) => a + b, 0) * mod
  const row = new Float32Array(Math.max(W, H)).fill(255)
  let x = Math.floor((row.length - total) / 2)
  widths.forEach((w, i) => { for (let k = 0; k < w * mod; k++) row[x + k] = i % 2 === 0 ? 20 : 255; x += w * mod })
  if (rev) { /* inversé : première largeur = dernière barre */ }
  const w3 = Array.from(row, (v, i) => (row[Math.max(0, i - 1)] + v + row[Math.min(row.length - 1, i + 1)]) / 3)
  const data = new Uint8ClampedArray(W * H * 4)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5)
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    const v = Math.max(0, Math.min(255, (vertical ? w3[y] : w3[xx]) + rnd() * noise))
    const p = (y * W + xx) * 4; data[p] = data[p + 1] = data[p + 2] = v; data[p + 3] = 255
  }
  return { data, width: W, height: H }
}

test('lecture Code 128 : numéro compact (jeu C)', () => { assert.equal(scanCode128(image('20260142')), '20260142') })
test('lecture Code 128 : numéro complet (jeu B)', () => { assert.equal(scanCode128(image('VTE-2026-0142', { mod: 2, W: 800 })), 'VTE-2026-0142') })
test('lecture Code 128 : avec bruit de caméra', () => { assert.equal(scanCode128(image('20260142', { noise: 40 })), '20260142') })
test('lecture Code 128 : à l’envers', () => { assert.equal(scanCode128(image('20260142', { rev: true })), '20260142') })
test('lecture Code 128 : petite image (320 px)', () => { assert.equal(scanCode128(image('20260142', { mod: 2, W: 320, H: 200 })), '20260142') })
test('lecture Code 128 : téléphone tenu en travers (vertical)', () => { assert.equal(scanCode128(image('20260142', { vertical: true, H: 640, W: 360 })), '20260142') })
test('aucun code : rien', () => { const d = new Uint8ClampedArray(100 * 100 * 4).fill(255); assert.equal(scanCode128({ data: d, width: 100, height: 100 }), null) })
