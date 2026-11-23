import { code128Widths } from './codes.js'
// Logo → image « raster » ESC/POS (GS v 0) pour imprimer le logo sur une imprimante thermique en direct (Bluetooth / USB).
// Partie pure (sans navigateur) : testable. La partie canvas (logoRaster) ne sert que dans le navigateur.

// Luminance (0 = noir … 255 = blanc) d'une image RGBA ; fond transparent = blanc.
// Un logo presque blanc (version « claire » pour papier foncé) est inversé pour être visible sur le papier thermique.
export function rgbaToGray(rgba, w, h) {
  const g = new Float32Array(w * h)
  let sum = 0, cnt = 0
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3] / 255
    const l = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]
    g[i] = l * a + 255 * (1 - a)
    if (a > 0.5) { sum += l; cnt++ }
  }
  if (cnt && sum / cnt > 215) { // logo clair : on inverse les pixels opaques
    for (let i = 0; i < w * h; i++) { const a = rgba[i * 4 + 3] / 255; const l = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]; g[i] = (255 - l) * a + 255 * (1 - a) }
  }
  return g
}

// gray : Float32Array/Uint8Array de w*h valeurs 0..255. Retourne les commandes GS v 0 par bandes de 128 lignes.
export function rasterToEscpos(gray, w, h, { dither = true } = {}) {
  const W = Math.ceil(w / 8) * 8
  const px = new Float32Array(W * h).fill(255)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * W + x] = gray[y * w + x]
  const bits = new Uint8Array((W / 8) * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < W; x++) {
      const old = px[y * W + x]
      const nw = old < 128 ? 0 : 255
      if (nw === 0) bits[y * (W / 8) + (x >> 3)] |= 0x80 >> (x & 7) // 1 = point noir
      if (dither) {
        const err = old - nw
        if (x + 1 < W) px[y * W + x + 1] += err * 7 / 16
        if (y + 1 < h) {
          if (x > 0) px[(y + 1) * W + x - 1] += err * 3 / 16
          px[(y + 1) * W + x] += err * 5 / 16
          if (x + 1 < W) px[(y + 1) * W + x + 1] += err * 1 / 16
        }
      }
    }
  }
  const out = []
  const rowB = W / 8
  for (let y0 = 0; y0 < h; y0 += 128) {
    const hh = Math.min(128, h - y0)
    out.push(0x1d, 0x76, 0x30, 0x00, rowB & 255, rowB >> 8, hh & 255, hh >> 8)
    for (let i = y0 * rowB; i < (y0 + hh) * rowB; i++) out.push(bits[i])
  }
  return Uint8Array.from(out)
}

const cache = new Map()
// Navigateur : charge l'image (URL ou data:), la réduit à `widthDots` points de large et retourne les octets ESC/POS (ou null).
export async function logoRaster(url, { widthDots = 256, maxHeight = 140 } = {}) {
  if (!url) return null
  const key = `${url.length > 200 ? url.length + url.slice(-40) : url}|${widthDots}|${maxHeight}`
  if (cache.has(key)) return cache.get(key)
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  await img.decode()
  let w = Math.max(8, Math.round(widthDots / 8) * 8)
  let h = Math.max(1, Math.round((img.naturalHeight * w) / img.naturalWidth))
  if (h > maxHeight) { w = Math.max(8, Math.floor((w * maxHeight) / h / 8) * 8); h = Math.max(1, Math.round((img.naturalHeight * w) / img.naturalWidth)) }
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, w, h)
  const d = ctx.getImageData(0, 0, w, h).data
  const bytes = rasterToEscpos(rgbaToGray(d, w, h), w, h)
  cache.set(key, bytes)
  return bytes
}
// Largeur du logo en points d'imprimante selon le papier (58 mm ≈ 384 points, 80 mm ≈ 576) et le réglage « largeur du logo » (px, 30–260)
export const logoDots = (cols, logoWidthPx) => {
  const max = cols <= 36 ? 384 : 576
  const frac = Math.max(0.2, Math.min(1, (Number(logoWidthPx) || 90) / (cols <= 36 ? 200 : 300)))
  return Math.max(96, Math.round((max * frac) / 8) * 8)
}

// Code 128 → image raster ESC/POS (pur, sans canvas). Chaque module = n points entiers (net pour les scanners). Retourne null si rien à dessiner.
export function barcodeRaster(text, { widthDots = 384, height = 64 } = {}) {
  const widths = code128Widths(text)
  if (!widths.length) return null
  const quiet = 5
  const modules = widths.reduce((a, b) => a + b, 0) + quiet * 2
  const mod = Math.max(1, Math.min(3, widthDots / modules)) // largeur d'un module en points (fractionnaire : remplit tout le papier)
  const w = Math.ceil(modules * mod)
  const gray = new Uint8Array(w * height).fill(255)
  let x = quiet
  widths.forEach((wd, i) => {
    if (i % 2 === 0) { const k0 = Math.round(x * mod), k1 = Math.max(k0 + 1, Math.round((x + wd) * mod)); for (let y = 0; y < height; y++) for (let k = k0; k < k1 && k < w; k++) gray[y * w + k] = 0 }
    x += wd
  })
  return rasterToEscpos(gray, w, height, { dither: false })
}
