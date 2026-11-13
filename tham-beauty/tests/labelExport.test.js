import test from 'node:test'
import assert from 'node:assert/strict'
import { labelSvg, makeZip } from '../src/lib/labelExport.js'

test('export étiquette : SVG à la bonne taille, avec code-barres et QR', () => {
  const svg = labelSvg({ name: 'Perruque', label: '24"', code: 'TB123', price: 10, cur: 'USD' }, { barcode: true, qr: true, price: true }, 50, 30)
  assert.match(svg, /width="500" height="300"/); assert.ok((svg.match(/<rect/g) || []).length > 30); assert.match(svg, /10,00 \$/); assert.match(svg, /24&quot;/)
})
test('export : ZIP non vide', async () => {
  const z = makeZip([{ name: 'a.png', data: new Uint8Array([1, 2, 3]) }])
  assert.ok((await z.arrayBuffer()).byteLength > 60)
})
