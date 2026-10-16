// Codes-barres (Code 128) et codes QR, générés localement (aucune bibliothèque externe, fonctionne hors ligne).
// + recherche d'un produit / d'un article en stock à partir d'un code scanné.

// ---------------------------------------------------------------- Code 128 (jeu B : ASCII 32–126)
const C128 = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112']
export const code128Clean = (text) => String(text ?? '').replace(/[^\x20-\x7e]/g, '')

// Retourne la suite des largeurs de modules (barre, espace, barre, …) — la première est toujours une barre.
export function code128Widths(text) {
  const s = code128Clean(text)
  if (!s) return []
  const codes = [104] // START B
  let sum = 104
  for (let i = 0; i < s.length; i++) {
    const v = s.charCodeAt(i) - 32
    codes.push(v)
    sum += v * (i + 1)
  }
  codes.push(sum % 103, 106) // contrôle + STOP
  return codes.flatMap((c) => C128[c].split('').map(Number))
}

// ---------------------------------------------------------------- Code QR (niveau de correction M, versions 1 à 6 : jusqu'à 106 octets)
// [ecc par bloc, [[nb blocs, octets de données par bloc], ...]]
const QR_M = { 1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]], 5: [24, [[2, 43]]], 6: [16, [[4, 27]]] }
const QR_ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] }

const EXP = new Array(512)
const LOG = new Array(256)
;(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255] })()
const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0)

function rsGenerator(deg) {
  let g = [1]
  for (let i = 0; i < deg; i++) {
    const next = new Array(g.length + 1).fill(0)
    g.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= gmul(c, EXP[i]) })
    g = next
  }
  return g // coefficients, degré décroissant
}
function rsRemainder(data, deg) {
  const gen = rsGenerator(deg)
  const rem = new Array(deg).fill(0)
  data.forEach((b) => {
    const f = b ^ rem.shift()
    rem.push(0)
    if (f) for (let i = 0; i < deg; i++) rem[i] ^= gmul(gen[i + 1], f)
  })
  return rem
}

export function qrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text ?? '')))
  let ver = 0
  for (let v = 1; v <= 6; v++) {
    const cap = QR_M[v][1].reduce((s, [n, d]) => s + n * d, 0)
    if (bytes.length + 2 <= cap) { ver = v; break }
  }
  if (!ver) throw new Error('Texte trop long pour le code QR (106 caractères maximum).')
  const [eccLen, groups] = QR_M[ver]
  const totalData = groups.reduce((s, [n, d]) => s + n * d, 0)

  // --- bits de données
  const bits = []
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1) }
  put(0b0100, 4); put(bytes.length, 8); bytes.forEach((b) => put(b, 8))
  put(0, Math.min(4, totalData * 8 - bits.length))
  while (bits.length % 8) bits.push(0)
  const cw = []
  for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2))
  for (let pad = 0xec; cw.length < totalData; pad ^= 0xec ^ 0x11) cw.push(pad)

  // --- blocs + correction d'erreur + entrelacement
  const blocks = []
  let pos = 0
  groups.forEach(([n, d]) => { for (let i = 0; i < n; i++) { const data = cw.slice(pos, pos + d); pos += d; blocks.push({ data, ecc: rsRemainder(data, eccLen) }) } })
  const finalCw = []
  const maxD = Math.max(...blocks.map((b) => b.data.length))
  for (let i = 0; i < maxD; i++) blocks.forEach((b) => { if (i < b.data.length) finalCw.push(b.data[i]) })
  for (let i = 0; i < eccLen; i++) blocks.forEach((b) => finalCw.push(b.ecc[i]))

  // --- matrice
  const size = 17 + 4 * ver
  const mod = Array.from({ length: size }, () => new Array(size).fill(false))
  const fn = Array.from({ length: size }, () => new Array(size).fill(false))
  const setFn = (x, y, v) => { if (x >= 0 && y >= 0 && x < size && y < size) { mod[y][x] = v; fn[y][x] = true } }
  for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0) }
  ;[[3, 3], [size - 4, 3], [3, size - 4]].forEach(([cx, cy]) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); setFn(cx + dx, cy + dy, d !== 2 && d !== 4) }
  })
  const al = QR_ALIGN[ver]
  al.forEach((cx, i) => al.forEach((cy, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
  }))
  const drawFormat = (mask) => {
    const data = (0b00 << 3) | mask // niveau M = 00
    let rem = data
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const f = ((data << 10) | rem) ^ 0x5412
    const bit = (i) => ((f >>> i) & 1) === 1
    for (let i = 0; i <= 5; i++) setFn(8, i, bit(i))
    setFn(8, 7, bit(6)); setFn(8, 8, bit(7)); setFn(7, 8, bit(8))
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(i))
    setFn(8, size - 8, true)
  }
  drawFormat(0)

  // --- placement des données en zigzag
  let k = 0
  const total = finalCw.length * 8
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const up = ((right + 1) & 2) === 0
        const y = up ? size - 1 - vert : vert
        if (!fn[y][x] && k < total) { mod[y][x] = ((finalCw[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; k++ }
      }
    }
  }

  // --- masques
  const maskFn = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => ((((x * y) % 2) + ((x * y) % 3)) % 2) === 0, (x, y) => ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0
  ]
  const applyMask = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskFn[m](x, y)) mod[y][x] = !mod[y][x] }
  const penalty = () => {
    let p = 0
    const line = (get) => {
      for (let a = 0; a < size; a++) {
        let run = 1
        for (let b = 1; b < size; b++) { if (get(a, b) === get(a, b - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++ } else run = 1 }
        for (let b = 0; b + 10 < size; b++) {
          const w = []
          for (let t = 0; t < 11; t++) w.push(get(a, b + t) ? 1 : 0)
          const s = w.join('')
          if (s === '10111010000' || s === '00001011101') p += 40
        }
      }
    }
    line((a, b) => mod[a][b]); line((a, b) => mod[b][a])
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3 }
    let dark = 0
    mod.forEach((r) => r.forEach((c) => { if (c) dark++ }))
    p += Math.floor(Math.abs((dark * 20) / (size * size) - 10)) * 10
    return p
  }
  let best = 0
  let bestP = Infinity
  for (let m = 0; m < 8; m++) {
    applyMask(m); drawFormat(m)
    const sc = penalty()
    if (sc < bestP) { bestP = sc; best = m }
    applyMask(m) // annule
  }
  applyMask(best); drawFormat(best)
  return mod
}

// ---------------------------------------------------------------- Codes des produits
export const normCode = (c) => String(c ?? '').trim().toLowerCase()
export const codeOf = (x) => String(x?.barcode || x?.sku || '').trim()
// Code court automatique (lettres/chiffres sans ambiguïté)
export const makeCode = () => 'TB' + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('')

// Retrouve le produit / la variante correspondant à un code scanné ou saisi
export function lookupCode(raw, products) {
  const c = normCode(raw)
  if (!c) return null
  for (const p of products || []) {
    for (const v of p.variants || []) {
      if (normCode(v.barcode) === c || normCode(v.sku) === c) return { product: p, variant: v }
    }
  }
  for (const p of products || []) {
    if (normCode(p.barcode) === c || normCode(p.sku) === c) return { product: p, variant: null }
  }
  return null
}

// Articles de stock (liste de { p, it, ... }) correspondant à un code
export function stockMatchesFor(raw, products, options) {
  const found = lookupCode(raw, products)
  const c = normCode(raw)
  return options.filter((o) => {
    if (found) {
      if (o.it.productId === found.product.id) return found.variant ? o.it.variantId === found.variant.id : true
    }
    return normCode(o.it.sku) === c
  })
}
