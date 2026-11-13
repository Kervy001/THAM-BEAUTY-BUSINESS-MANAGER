// Export d'étiquettes en fichiers (PNG, ZIP de PNG, PDF) pour les imprimer avec l'application de l'imprimante
// (Niimbot, Phomemo, Brother iPrint…) au lieu de la fenêtre d'impression. Aucune bibliothèque externe.
import { code128Widths, qrMatrix } from './codes.js'
import { money } from './util.js'
import { sheetGrid, BUILTIN_TEMPLATES } from './printing.js'

const PX_PER_MM = 12 // ≈ 305 dpi
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const fit = (t, maxChars) => { const s = String(t ?? ''); return s.length > maxChars ? s.slice(0, Math.max(1, maxChars - 1)) + '…' : s }

// L'étiquette dessinée en SVG (unités = 1/10 de mm). Un seul dessin sert pour l'aperçu, l'impression et l'export,
// il suit le modèle choisi (o.tpl : couleurs, cadre, bandeau, éléments dans l'ordre, tailles, alignements).
const BASE = { shop: 0.7, name: 1, variant: 0.88, price: 0.88, code: 0.78, extra: 0.7, date: 0.7 }
const ANCHOR = { left: 'start', center: 'middle', right: 'end' }
const FONT = 'Arial, Helvetica, sans-serif'
export function labelSvg(l, show, w, h, o = {}) {
  const tpl = o.tpl || BUILTIN_TEMPLATES[0]
  const th = tpl.theme || BUILTIN_TEMPLATES[0].theme
  const W = w * 10, H = h * 10
  const small = h < 24
  const rich = !small && h >= 28
  const baseFs = Math.max(6, Math.min(11, h * 0.27)) * (o.fontScale || 1) * 3.528 // pt → 1/10 mm
  const pad = (o.pad ?? 1.2) * 10 + (th.frame ? 6 : 0)
  const availW = W - pad * 2
  const price = show.price !== false && Number(l.price) > 0 ? money(l.price, l.cur) : ''
  const widths = code128Widths(l.code)
  const qrOn = !!tpl.qr && show.qr !== false && !small && w >= 45
  // éléments visibles, dans l'ordre du modèle
  const vis = []
  for (const e of tpl.els || []) {
    if (!e.on) continue
    let text = ''
    if (e.k === 'shop') { if (rich && o.shopText) text = String(o.shopText).toUpperCase() }
    else if (e.k === 'name') text = l.name
    else if (e.k === 'variant') text = l.label
    else if (e.k === 'price') text = price
    else if (e.k === 'code') { if (!small) text = l.code }
    else if (e.k === 'extra') { if (rich) text = o.extra }
    else if (e.k === 'date') { if (rich) text = new Date().toLocaleDateString('fr-FR') }
    else if (e.k === 'barcode') { if (show.barcode !== false && widths.length) vis.push({ ...e, bar: true }); continue }
    if (text) vis.push({ ...e, text: String(text) })
  }
  // lignes : variante + prix, ligne libre + date côte à côte quand ils se suivent
  const rows = []
  for (let i = 0; i < vis.length; i++) {
    const e = vis[i], n = vis[i + 1]
    if (!e.bar && n && !n.bar && ((e.k === 'variant' && n.k === 'price') || (e.k === 'extra' && n.k === 'date')) && e.align !== 'center' && n.align !== 'center') { rows.push({ pair: [e, n] }); i++ } else rows.push({ one: e })
  }
  const fsOf = (e) => baseFs * (BASE[e.k] || 1) * (Number(e.size) || 100) / 100
  const cw = (e) => (e.bold ? 0.6 : 0.55) + (e.k === 'shop' || e.k === 'code' ? 0.12 : 0)
  // taille réelle d'un texte : réduite pour tenir dans la largeur, puis tronquée si besoin
  const fitText = (e, maxW) => {
    const f0 = fsOf(e)
    const floor = f0 * ((Number(e.size) || 100) > 200 ? 0.3 : 0.6)
    let fs = Math.min(f0, maxW / (e.text.length * cw(e)))
    fs = Math.max(floor, fs)
    const maxChars = Math.floor(maxW / (fs * cw(e)))
    return { fs, text: e.text.length > maxChars ? e.text.slice(0, Math.max(1, maxChars - 1)) + '…' : e.text }
  }
  const lineH = (fs) => fs * 1.25
  const prepared = rows.map((r) => {
    if (r.one && r.one.bar) return { bar: r.one }
    if (r.one) { const f = fitText(r.one, availW); return { items: [{ e: r.one, ...f }], h: lineH(f.fs) } }
    const [a, b] = r.pair
    const fb = fitText(b, availW * 0.5)
    const fa = fitText(a, availW - fb.text.length * fb.fs * cw(b) - pad * 0.5)
    return { items: [{ e: a, ...fa }, { e: b, ...fb }], h: lineH(Math.max(fa.fs, fb.fs)) }
  })
  const padY = pad
  const availH = H - padY * 2
  const fixed = prepared.reduce((s2, r) => s2 + (r.bar ? 0 : r.h), 0)
  const hasBar = prepared.some((r) => r.bar)
  const slot = Math.max(0, availH - fixed)
  const nGaps = Math.max(0, prepared.length - 1)
  const gap = hasBar ? 0 : Math.min(slot / (nGaps + 1), baseFs * 0.45)
  const used = fixed + gap * nGaps
  let y = padY + (hasBar ? 0 : Math.max(0, (availH - used) / 2))
  const col = th.fg || '#000'
  let svg = `<rect x="${th.frame ? 2 : 0}" y="${th.frame ? 2 : 0}" width="${th.frame ? W - 4 : W}" height="${th.frame ? H - 4 : H}" rx="${th.frame ? (th.radius || 1.5) * 10 : 0}" fill="${th.bg || '#fff'}"${th.frame ? ` stroke="${th.accent || col}" stroke-width="4"` : ''}/>`
  const colorOf = (e, inBand) => inBand ? (th.bg || '#fff') : e.k === 'price' ? (th.accent || col) : col
  const txt = (e, text, fs, x, anchor, yBase, inBand) => `<text x="${x.toFixed(1)}" y="${yBase.toFixed(1)}" text-anchor="${anchor}" font-family="${FONT}" font-size="${fs.toFixed(1)}"${e.bold ? ' font-weight="700"' : ''}${e.k === 'shop' || e.k === 'code' ? ' letter-spacing="1"' : ''} fill="${colorOf(e, inBand)}"${e.k === 'extra' || e.k === 'date' ? ' fill-opacity="0.85"' : ''}>${esc(text)}</text>`
  prepared.forEach((r, i) => {
    if (r.bar) {
      const e = r.bar
      const bh0 = Math.max(70, h * (small ? 0.44 : 0.38) * 10) * (Number(e.size) || 100) / 100
      const hh = Math.min(bh0, slot), y0 = y + (slot - hh) / 2
      const qrSize = Math.min(hh, w * 0.3 * 10, 220)
      const bw = availW - (qrOn ? qrSize + 15 : 0)
      const quiet = 10, total = widths.reduce((s2, v) => s2 + v, 0) + quiet * 2, k = bw / total
      if (hh > 5) {
        svg += `<rect x="${pad.toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}" fill="#fff"/>`
        let x = quiet
        widths.forEach((wd, j) => { if (j % 2 === 0) svg += `<rect x="${(pad + x * k).toFixed(2)}" y="${y0.toFixed(2)}" width="${(wd * k).toFixed(2)}" height="${hh.toFixed(2)}" fill="#000"/>`; x += wd })
        if (qrOn) {
          let m = null
          try { m = qrMatrix(l.code) } catch { m = null }
          if (m) {
            const n = m.length, q = 4, cell = qrSize / (n + q * 2), x0 = W - pad - qrSize, yq = y + (slot - qrSize) / 2
            svg += `<rect x="${x0.toFixed(1)}" y="${yq.toFixed(1)}" width="${qrSize.toFixed(1)}" height="${qrSize.toFixed(1)}" fill="#fff"/>`
            m.forEach((row, yy) => row.forEach((c, xx) => { if (c) svg += `<rect x="${(x0 + (xx + q) * cell).toFixed(2)}" y="${(yq + (yy + q) * cell).toFixed(2)}" width="${(cell + 0.3).toFixed(2)}" height="${(cell + 0.3).toFixed(2)}" fill="#000"/>` }))
          }
        }
      }
      y += slot
      return
    }
    const band = !!th.band && i === 0 && r.items[0].e.k === 'shop'
    if (band) svg = svg.replace(/^(<rect[^>]*\/>)/, (m0) => m0 + `<rect x="${th.frame ? 2 : 0}" y="${th.frame ? 2 : 0}" width="${th.frame ? W - 4 : W}" height="${(y + r.h + padY * 0.35 - (th.frame ? 2 : 0)).toFixed(1)}" fill="${th.accent || col}"/>`)
    r.items.forEach((it, j) => {
      const e = it.e
      const al = r.items.length === 2 ? (j === 0 ? 'left' : 'right') : e.align
      const x = al === 'center' ? W / 2 : al === 'right' ? W - pad : pad
      svg += txt(e, it.text, it.fs, x, ANCHOR[al] || 'start', y + it.fs * 1.0 + (r.h - lineH(it.fs)) / 2, band)
    })
    y += r.h + gap
  })
  const dims = o.inline ? 'width="100%" height="100%" style="display:block"' : `width="${W}" height="${H}"`
  return `<svg xmlns="http://www.w3.org/2000/svg" ${dims} viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${svg}</svg>`
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
