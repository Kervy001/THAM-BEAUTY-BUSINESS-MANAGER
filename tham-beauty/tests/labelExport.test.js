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

import { BUILTIN_TEMPLATES, templatesOf, resolveTemplate, newCustomTemplate } from '../src/lib/printing.js'
const L = { name: 'Perruque', label: '24 pouces', code: 'TB123', price: 10, cur: 'USD' }
test('modèles : chaque modèle intégré produit un SVG valide', () => {
  for (const t of BUILTIN_TEMPLATES) {
    const svg = labelSvg(L, { barcode: true, qr: true, price: true }, 50, 30, { tpl: t, shopText: 'THAM', extra: 'x' })
    assert.match(svg, /^<svg[\s\S]*<\/svg>$/); assert.ok(!svg.includes('NaN') && !svg.includes('undefined'), t.id)
  }
})
test('modèle longueur : grande longueur, pas de code-barres', () => {
  const t = BUILTIN_TEMPLATES.find((x) => x.id === 'longueur-rouge')
  const svg = labelSvg(L, { barcode: true, qr: true, price: true }, 50, 30, { tpl: t })
  assert.match(svg, /24 pouces/); assert.match(svg, /#d90429/); assert.ok((svg.match(/<rect/g) || []).length < 5)
})
test('modèles : standard suit les anciens réglages, modèles personnalisés ajoutés, choix par défaut', () => {
  const s = { labelTpl: { shop: true, extra: 'IG' }, labelTemplates: [{ ...newCustomTemplate(BUILTIN_TEMPLATES[1], 'Mon style'), id: 'c1' }], labelTplDefault: 'c1' }
  const all = templatesOf(s)
  assert.equal(all.length, BUILTIN_TEMPLATES.length + 1)
  assert.ok(all[0].els.find((e) => e.k === 'shop').on)
  assert.equal(resolveTemplate(s, { tplId: '' }).id, 'c1')
  assert.equal(resolveTemplate(s, { tplId: 'rose' }).id, 'rose')
  assert.equal(resolveTemplate({}, { tplId: 'inconnu' }).id, 'standard')
})
test('modèle personnalisé : ordre et alignement respectés', () => {
  const t = newCustomTemplate(BUILTIN_TEMPLATES[0], 'T'); t.els = [t.els.find((e) => e.k === 'price'), ...t.els.filter((e) => e.k !== 'price')]
  t.els[0].align = 'center'; t.els[0].on = true
  const svg = labelSvg(L, { barcode: true, price: true }, 50, 30, { tpl: t })
  assert.ok(svg.indexOf('10,00') < svg.indexOf('Perruque')); assert.match(svg, /text-anchor="middle"[^>]*>10,00/)
})
