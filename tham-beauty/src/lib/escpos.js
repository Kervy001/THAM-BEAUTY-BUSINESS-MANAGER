// Construction d'un reçu en commandes ESC/POS (imprimantes thermiques 58 mm / 80 mm) — fonction pure, sans navigateur.
// model = { company:{name,address,phone}, docTitle, number, date, customer, seller,
//           lines:[{label, qty, unit, total, disc, returned}], totals:[[label, value, bold?]], payments:[string], note, footer }
// opts  = { cols (32 pour 58 mm, 48 pour 80 mm), accents (CP858), feed (lignes vides à la fin), cut }

const ESC = 0x1b, GS = 0x1d, LF = 0x0a
// Table CP858 (page de codes 19 d'Epson) pour les lettres françaises usuelles
const CP858 = { 'é': 0x82, 'è': 0x8a, 'ê': 0x88, 'ë': 0x89, 'à': 0x85, 'â': 0x83, 'ä': 0x84, 'ç': 0x87, 'î': 0x8c, 'ï': 0x8b, 'ô': 0x93, 'ö': 0x94, 'ù': 0x97, 'û': 0x96, 'ü': 0x81, 'É': 0x90, 'À': 0xb7, 'È': 0xd4, 'Ç': 0x80, 'Ê': 0xd2, 'Ô': 0xe2, 'Î': 0xd7, '€': 0xd5, '«': 0xae, '»': 0xaf }

export function clean(str, accents = false, collapse = true) {
  let s = String(str ?? '')
    .replace(/[    ]/g, ' ')
    .replace(/[’‘`]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/[×✕]/g, 'x').replace(/[·•]/g, '-')
    .replace(/œ/g, 'oe').replace(/Œ/g, 'OE')
  if (collapse) s = s.replace(/\s+/g, ' ')
  if (!accents) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  return collapse ? s.trim() : s
}
function enc(str, accents) {
  const out = []
  for (const ch of clean(str, accents, false)) {
    const c = ch.codePointAt(0)
    if (c >= 0x20 && c < 0x7f) out.push(c)
    else if (accents && CP858[ch] !== undefined) out.push(CP858[ch])
    else out.push(0x3f) // « ? »
  }
  return out
}
function wrap(text, cols) {
  const words = clean(text, true).split(' ').filter(Boolean)
  const rows = []
  let cur = ''
  for (let w of words) {
    while (w.length > cols) { if (cur) { rows.push(cur); cur = '' } rows.push(w.slice(0, cols)); w = w.slice(cols) }
    if (!cur) cur = w
    else if ((cur + ' ' + w).length <= cols) cur += ' ' + w
    else { rows.push(cur); cur = w }
  }
  if (cur) rows.push(cur)
  return rows.length ? rows : ['']
}
// gauche … droite sur une ligne de `cols` caractères
export function pad2(left, right, cols) {
  const l = clean(left, true), r = clean(right, true)
  if (l.length + r.length + 1 > cols) return [l, ' '.repeat(Math.max(0, cols - r.length)) + r]
  return [l + ' '.repeat(cols - l.length - r.length) + r]
}

export function receiptToEscpos(m, o = {}) {
  const cols = Math.max(20, Math.min(64, Math.floor(o.cols) || 32))
  const accents = !!o.accents
  const b = []
  const raw = (...x) => b.push(...x)
  const text = (s) => b.push(...enc(s, accents), LF)
  const line = (s) => text(s)
  const align = (n) => raw(ESC, 0x61, n) // 0 gauche, 1 centre, 2 droite
  const bold = (on) => raw(ESC, 0x45, on ? 1 : 0)
  const size = (n) => raw(GS, 0x21, n) // 0x00 normal, 0x11 double largeur+hauteur, 0x01 double hauteur
  const sep = (ch = '-') => line(ch.repeat(cols))

  raw(ESC, 0x40) // initialisation
  if (accents) raw(ESC, 0x74, 19) // page de codes CP858
  align(1)
  const co = m.company || {}
  size(0x11); bold(true)
  for (const r of wrap(co.name || 'THAM BEAUTY', Math.floor(cols / 2))) line(r)
  size(0); bold(false)
  if (co.address) for (const r of wrap(co.address, cols)) line(r)
  if (co.phone) line(co.phone)
  line('')
  bold(true); line(m.docTitle || 'Reçu'); bold(false)
  if (m.number) line(m.number)
  if (m.date) line(m.date)
  align(0)
  sep()
  if (m.customer) for (const r of wrap('Client : ' + m.customer, cols)) line(r)
  if (m.seller) for (const r of wrap('Vendeur : ' + m.seller, cols)) line(r)
  sep()
  for (const l of m.lines || []) {
    bold(true); for (const r of wrap(l.label, cols)) line(r); bold(false)
    for (const r of pad2(`${l.qty} x ${l.unit}`, l.total, cols)) line(r)
    if (l.disc) for (const r of pad2('  Réduction', '-' + l.disc, cols)) line(r)
    if (l.returned) line(`  retourné : ${l.returned}`)
  }
  sep()
  for (const [label, value, strong] of m.totals || []) {
    if (strong) bold(true)
    for (const r of pad2(label, value, cols)) line(r)
    if (strong) bold(false)
  }
  if ((m.payments || []).length) {
    sep()
    bold(true); line('Paiements'); bold(false)
    for (const p of m.payments) for (const r of wrap(p, cols)) line(r)
  }
  if (m.note) { sep(); for (const r of wrap(m.note, cols)) line(r) }
  if (m.footer) { line(''); align(1); for (const r of wrap(m.footer, cols)) line(r); align(0) }
  for (let i = 0; i < (o.feed ?? 3); i++) line('')
  if (o.cut) raw(GS, 0x56, 66, 0) // coupe partielle (si l'imprimante a un couteau)
  return Uint8Array.from(b)
}
// Colonnes par défaut selon le format de papier
export const colsFor = (formatId, widthMm) => (formatId === 'ticket58' ? 32 : formatId === 'ticket' ? 48 : formatId === 'ticketc' ? Math.max(24, Math.floor((Number(widthMm) || 72) * 0.58)) : 32)
