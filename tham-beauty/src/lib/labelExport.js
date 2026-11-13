// Export d'étiquettes en fichiers (PNG, ZIP de PNG, PDF) pour les imprimer avec l'application de l'imprimante
// (Niimbot, Phomemo, Brother iPrint…) au lieu de la fenêtre d'impression. Aucune bibliothèque externe.
import { code128Widths, qrMatrix } from './codes.js'
import { money } from './util.js'
import { sheetGrid } from './printing.js'

const PX_PER_MM = 12 // ≈ 305 dpi
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const fit = (t, maxChars) => { const s = String(t ?? ''); return s.length > maxChars ? s.slice(0, Math.max(1, maxChars - 1)) + '…' : s }

// L'étiquette dessinée en SVG (unités = 1/10 de mm), même mise en page que l'aperçu / l'impression
export function labelSvg(l, show, w, h, o = {}) {
  const W = w * 10, H = h * 10
  const small = h < 24
  const fs = Math.max(6, Math.min(11, h * 0.27)) * (o.fontScale || 1) * 3.528 // pt → 1/10 mm
  const pad = (o.pad ?? 1.2) * 10
  const rich = !small && h >= 28
  const shopH = rich && o.shop ? fs * 0.7 * 1.2 : 0
  const extraH = rich && (o.extra || o.date) ? fs * 0.7 * 1.3 : 0
  const qrOn = !small && show.qr && w >= 45
  const qrSize = Math.min(h * 0.5, w * 0.3, 22) * 10
  const bh = Math.max(7, h * (small ? 0.44 : 0.38)) * 10
  const name = fit(l.name, Math.floor((W - pad * 2) / (fs * 0.55)))
  const price = show.price && Number(l.price) > 0 ? money(l.price, l.cur) : ''
  const sub = fit(l.label, Math.floor((W - pad * 2 - price.length * fs * 0.5) / (fs * 0.88 * 0.52)))
  const codeLineH = small || o.codeText === false ? 0 : fs * 0.78 * 1.3
  const top = pad + shopH + fs * 1.1 + fs * 0.88 * 1.25
  const availH = H - pad - codeLineH - extraH - top
  let body = ''
  // code-barres
  const widths = code128Widths(l.code)
  if (show.barcode && widths.length) {
    const quiet = 10, total = widths.reduce((a, b) => a + b, 0) + quiet * 2
    const bw = W - pad * 2 - (qrOn ? qrSize + 15 : 0)
    const hh = Math.min(bh, availH)
    const y0 = top + (availH - hh) / 2
    const k = bw / total
    let x = quiet
    widths.forEach((wd, i) => { if (i % 2 === 0) body += `<rect x="${(pad + x * k).toFixed(2)}" y="${y0.toFixed(2)}" width="${(wd * k).toFixed(2)}" height="${hh.toFixed(2)}" fill="#000"/>`; x += wd })
  }
  // QR
  if (qrOn) {
    let m = null
    try { m = qrMatrix(l.code) } catch { m = null }
    if (m) {
      const n = m.length, q = 4, cell = qrSize / (n + q * 2)
      const x0 = W - pad - qrSize, y0 = top + (availH - qrSize) / 2
      m.forEach((row, y) => row.forEach((c, x) => { if (c) body += `<rect x="${(x0 + (x + q) * cell).toFixed(2)}" y="${(y0 + (y + q) * cell).toFixed(2)}" width="${(cell + 0.3).toFixed(2)}" height="${(cell + 0.3).toFixed(2)}" fill="#000"/>` }))
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>`
    + (shopH ? `<text x="${pad}" y="${pad + fs * 0.7}" font-family="Arial, Helvetica, sans-serif" font-size="${(fs * 0.7).toFixed(1)}" letter-spacing="1" fill="#333">${esc(fit(String(o.shop).toUpperCase(), Math.floor((W - pad * 2) / (fs * 0.7 * 0.62))))}</text>` : '')
    + `<text x="${pad}" y="${pad + shopH + fs}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fs.toFixed(1)}" fill="#000">${esc(name)}</text>`
    + `<text x="${pad}" y="${pad + shopH + fs * 1.1 + fs * 0.88}" font-family="Arial, Helvetica, sans-serif" font-size="${(fs * 0.88).toFixed(1)}" fill="#000">${esc(sub)}</text>`
    + (price ? `<text x="${W - pad}" y="${pad + shopH + fs * 1.1 + fs * 0.88}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${(fs * 0.88).toFixed(1)}" fill="#000">${esc(price)}</text>` : '')
    + body
    + (small || o.codeText === false ? '' : `<text x="${W / 2}" y="${H - pad * 0.7 - extraH}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${(fs * 0.78).toFixed(1)}" letter-spacing="1" fill="#000">${esc(l.code)}</text>`)
    + (extraH ? `<text x="${pad}" y="${H - pad * 0.6}" font-family="Arial, Helvetica, sans-serif" font-size="${(fs * 0.7).toFixed(1)}" fill="#222">${esc(fit(o.extra || '', Math.floor((W - pad * 2 - (o.date ? 200 : 0)) / (fs * 0.7 * 0.55))))}</text>` : '')
    + (extraH && o.date ? `<text x="${W - pad}" y="${H - pad * 0.6}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="${(fs * 0.7).toFixed(1)}" fill="#222">${esc(new Date().toLocaleDateString('fr-FR'))}</text>` : '')
    + '</svg>'
}

export function svgToCanvas(svg, wMm, hMm) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = Math.round(wMm * PX_PER_MM); c.height = Math.round(hMm * PX_PER_MM)
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0, c.width, c.height)
      resolve(c)
    }
    img.onerror = () => reject(new Error('Impossible de dessiner l’étiquette.'))
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })
}
const toBlob = (c, type = 'image/png', q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Export impossible.'))), type, q))
const bytes = async (blob) => new Uint8Array(await blob.arrayBuffer())

// ---- ZIP minimal (sans compression) ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
export function makeZip(files) {
  const enc = new TextEncoder()
  const parts = [], central = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length
    const lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true)
    lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true)
    parts.push(new Uint8Array(lh.buffer), name, f.data)
    const ch = new DataView(new ArrayBuffer(46))
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true)
    ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true)
    central.push(new Uint8Array(ch.buffer), name)
    offset += 30 + name.length + size
  }
  const cdSize = central.reduce((t, p) => t + p.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' })
}

// ---- PDF minimal : une image JPEG par page, à la taille exacte (mm) ----
export function makePdf(pages) {
  const enc = new TextEncoder()
  const chunks = []
  const offsets = []
  let pos = 0
  const add = (x) => { const u = typeof x === 'string' ? enc.encode(x) : x; chunks.push(u); pos += u.length }
  const obj = (n, body) => { offsets[n] = pos; add(`${n} 0 obj\n`); add(body); add('\nendobj\n') }
  add('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
  const N = pages.length
  // objets : 1 catalogue, 2 pages, puis par page : page, contenu, image
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, `<< /Type /Pages /Count ${N} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`)
  pages.forEach((p, i) => {
    const base = 3 + i * 3
    const W = +(p.wMm * 72 / 25.4).toFixed(2), H = +(p.hMm * 72 / 25.4).toFixed(2)
    obj(base, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${base + 2} 0 R >> >> /Contents ${base + 1} 0 R >>`)
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`
    obj(base + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    offsets[base + 2] = pos
    add(`${base + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.pxW} /Height ${p.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`)
    add(p.jpeg); add('\nendstream\nendobj\n')
  })
  const total = 3 + N * 3
  const xref = pos
  add(`xref\n0 ${total}\n0000000000 65535 f \n`)
  for (let i = 1; i < total; i++) add(String(offsets[i]).padStart(10, '0') + ' 00000 n \n')
  add(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
  return new Blob(chunks, { type: 'application/pdf' })
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000)
}

const safe = (s) => String(s || 'etiquette').replace(/[^\w.-]+/g, '_').slice(0, 40)

// labels : [{ name, label, code, price, cur, key }] ; F : format ({ w, h, sheet }) ; show : { barcode, qr, price }
export async function exportLabels(kind, labels, F, show, o = {}, prefs = null) {
  const cvs = []
  for (const l of labels) cvs.push(await svgToCanvas(labelSvg(l, show, F.w, F.h, o), F.w, F.h))
  const day = new Date().toISOString().slice(0, 10)
  if (kind === 'png') {
    const files = []
    for (let i = 0; i < cvs.length; i++) files.push({ name: `${String(i + 1).padStart(3, '0')}-${safe(labels[i].code)}.png`, data: await bytes(await toBlob(cvs[i])) })
    if (files.length === 1) download(new Blob([files[0].data], { type: 'image/png' }), files[0].name)
    else download(makeZip(files), `etiquettes-${day}.zip`)
    return files.length
  }
  // PDF
  const pages = []
  const jpegOf = async (c) => bytes(await toBlob(c, 'image/jpeg', 0.95))
  if (F.sheet) {
    // planche A4 : étiquettes en grille selon les réglages de la feuille
    const G = sheetGrid(prefs || undefined)
    const A4w = 210, A4h = 297
    const cols = G.cols, rows = G.rows
    for (let i = 0; i < cvs.length; i += cols * rows) {
      const c = document.createElement('canvas'); c.width = A4w * PX_PER_MM; c.height = A4h * PX_PER_MM
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
      cvs.slice(i, i + cols * rows).forEach((lc, k) => {
        const x = G.left + (k % cols) * (F.w + G.gapX), y = G.top + Math.floor(k / cols) * (F.h + G.gapY)
        ctx.drawImage(lc, x * PX_PER_MM, y * PX_PER_MM)
        if (o.contour) { ctx.strokeStyle = '#888'; ctx.setLineDash([6, 6]); ctx.strokeRect(x * PX_PER_MM, y * PX_PER_MM, F.w * PX_PER_MM, F.h * PX_PER_MM) }
      })
      pages.push({ jpeg: await jpegOf(c), pxW: c.width, pxH: c.height, wMm: A4w, hMm: A4h })
    }
  } else {
    for (const c of cvs) pages.push({ jpeg: await jpegOf(c), pxW: c.width, pxH: c.height, wMm: F.w, hMm: F.h })
  }
  download(makePdf(pages), `etiquettes-${day}.pdf`)
  return labels.length
}
