// Lecteur de codes-barres Code 128 en JavaScript pur (sans Internet, sans bibliothèque).
// Sert de remplacement au détecteur intégré du navigateur, absent sur iPhone / Safari.
import { C128 } from './codes.js'

const PAT = C128.map((p) => p.split('').map(Number))

// Largeurs de barres / espaces d'une ligne de pixels (gris 0..255) ; la première valeur est une barre (sombre).
function runsOf(row, thr) {
  const out = []
  let dark = row[0] < thr
  let n = 0
  let started = dark // on ignore la marge claire avant la première barre
  for (let i = 0; i < row.length; i++) {
    const d = row[i] < thr
    if (d === dark) n++
    else { if (started) out.push(n); started = true; dark = d; n = 1 }
  }
  out.push(n)
  return out
}

// Meilleur symbole pour 6 largeurs (unité = somme / 11) — retourne [code, erreur]
function match(w) {
  const sum = w[0] + w[1] + w[2] + w[3] + w[4] + w[5]
  if (sum < 6) return [-1, 99]
  const u = sum / 11
  let best = -1
  let be = 99
  for (let c = 0; c < 107; c++) {
    const p = PAT[c]
    let e = 0
    for (let k = 0; k < 6; k++) { const d = w[k] / u - p[k]; e += d * d }
    if (e < be) { be = e; best = c }
  }
  return [best, be]
}

// Décodage propre en deux temps : on lit tous les symboles, puis on vérifie le contrôle et on interprète les valeurs.
function decodeFrom(runs, from) {
  const first = runs.slice(from, from + 6)
  if (first.length < 6) return null
  const [start, err] = match(first)
  if (start < 103 || start > 105 || err > 1.8) return null
  const vals = [start]
  let i = from + 6
  for (let guard = 0; guard < 60; guard++) {
    const ww = runs.slice(i, i + 6)
    if (ww.length < 6) return null
    const [c, e] = match(ww)
    if (c < 0 || e > 1.8) return null
    i += 6
    if (c === 106) break
    vals.push(c)
  }
  if (vals.length < 4) return null
  const chk = vals.pop()
  let sum = vals[0]
  for (let k = 1; k < vals.length; k++) sum += vals[k] * k
  if (sum % 103 !== chk) return null
  let set = start === 103 ? 'A' : start === 104 ? 'B' : 'C'
  let text = ''
  for (let k = 1; k < vals.length; k++) {
    const c = vals[k]
    if (c === 99) set = 'C'
    else if (c === 100) set = 'B'
    else if (c === 101) set = 'A'
    else if (c >= 96) continue
    else if (set === 'C') text += String(c).padStart(2, '0')
    else text += String.fromCharCode(c + 32)
  }
  return text || null
}

function tryRow(row) {
  let lo = 255; let hi = 0
  for (let i = 0; i < row.length; i++) { const v = row[i]; if (v < lo) lo = v; if (v > hi) hi = v }
  if (hi - lo < 40) return null
  for (const f of [0.5, 0.4, 0.6, 0.33, 0.67]) {
    const runs = runsOf(row, lo + (hi - lo) * f)
    for (let from = 0; from + 40 <= runs.length; from += 2) { // une barre démarre aux index pairs
      const t = decodeFrom(runs, from)
      if (t) return t
    }
    const trimmed = runs.length % 2 === 0 ? runs.slice(0, -1) : runs // sens inverse : on retire la marge claire finale pour recommencer par une barre
    const rev = trimmed.slice().reverse()
    for (let from = 0; from + 40 <= rev.length; from += 2) {
      const t = decodeFrom(rev, from)
      if (t) return t
    }
  }
  return null
}

// Lisse légèrement (moyenne sur 3 pixels) pour supprimer le bruit de la caméra
function smooth(row) {
  const o = new Uint8Array(row.length)
  for (let i = 0; i < row.length; i++) o[i] = ((row[Math.max(0, i - 1)] + row[i] + row[Math.min(row.length - 1, i + 1)]) / 3) | 0
  return o
}

// Cherche un code 128 dans une image (RGBA ImageData) : plusieurs lignes horizontales, puis verticales (téléphone tenu autrement).
export function scanCode128(img) {
  const { data, width: W, height: H } = img
  const gray = new Uint8Array(W * H)
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) gray[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8
  const rowAt = (y) => smooth(gray.subarray(y * W, y * W + W))
  const colAt = (x) => { const c = new Uint8Array(H); for (let y = 0; y < H; y++) c[y] = gray[y * W + x]; return smooth(c) }
  const ys = []
  for (let k = 0; k < 17; k++) ys.push(Math.floor(H * (0.5 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.03)))
  for (const y of ys) { if (y < 0 || y >= H) continue; const t = tryRow(rowAt(y)); if (t) return t }
  const xs = []
  for (let k = 0; k < 17; k++) xs.push(Math.floor(W * (0.5 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.03)))
  for (const x of xs) { if (x < 0 || x >= W) continue; const t = tryRow(colAt(x)); if (t) return t }
  return null
}

export { tryRow }
