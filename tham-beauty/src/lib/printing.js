// Formats et réglages d'impression (étiquettes autocollantes, reçus thermiques) et du scanner.
// Les réglages sont mémorisés PAR APPAREIL (chaque téléphone / ordinateur a sa propre imprimante et son propre scanner).
// Le modèle d'étiquette (nom de la boutique, date, ligne libre…) est commun à toute l'entreprise (réglages).
export const LABEL_FORMATS = [
  { id: 'a4', name: 'Planche A4 d’étiquettes (feuille autocollante)', w: 56, h: 34, sheet: true },
  { id: 'l30x20', name: '30 × 20 mm (bijoux, petits articles)', w: 30, h: 20 },
  { id: 'l40x30', name: '40 × 30 mm', w: 40, h: 30 },
  { id: 'l50x30', name: '50 × 30 mm', w: 50, h: 30 },
  { id: 'l50x40', name: '50 × 40 mm', w: 50, h: 40 },
  { id: 'l57x32', name: '57 × 32 mm', w: 57, h: 32 },
  { id: 'l60x40', name: '60 × 40 mm', w: 60, h: 40 },
  { id: 'l70x50', name: '70 × 50 mm', w: 70, h: 50 },
  { id: 'l100x50', name: '100 × 50 mm', w: 100, h: 50 },
  { id: 'l100x100', name: '100 × 100 mm', w: 100, h: 100 },
  { id: 'l100x150', name: '100 × 150 mm (colis / expédition)', w: 100, h: 150 },
  { id: 'custom', name: 'Taille personnalisée…', w: 50, h: 30, custom: true }
]
// Type de papier de l'imprimante d'étiquettes
export const PAPER_TYPES = [
  { id: 'gap', name: 'Rouleau d’étiquettes avec espaces (le plus courant)', help: 'Imprimante réglée en « étiquettes avec espaces » (gap). Faites une calibration du capteur quand vous changez de rouleau.' },
  { id: 'continu', name: 'Rouleau continu (sans espaces)', help: 'Papier continu : réglez la longueur de page sur la hauteur de l’étiquette dans le pilote.' },
  { id: 'mark', name: 'Rouleau à marque noire', help: 'Imprimante réglée sur « marque noire » (black mark) dans le pilote.' },
  { id: 'sheet', name: 'Feuilles A4 autocollantes (imprimante classique)', help: 'Choisissez le format « Planche A4 » ci-dessus et réglez le nombre de colonnes / lignes de votre feuille.' }
]
// Planches A4 d'étiquettes courantes (mm)
export const SHEET_PRESETS = [
  { id: 'p56', name: '3 × 8 — 56 × 34 mm (par défaut)', w: 56, h: 34, cols: 3, rows: 8, top: 8, left: 8, gapX: 3, gapY: 3 },
  { id: 'l7160', name: '21 par page — 63,5 × 38,1 (3 × 7)', w: 63.5, h: 38.1, cols: 3, rows: 7, top: 15.1, left: 7.2, gapX: 2.5, gapY: 0 },
  { id: 'a24', name: '24 par page — 70 × 37 (3 × 8)', w: 70, h: 37, cols: 3, rows: 8, top: 0, left: 0, gapX: 0, gapY: 0 },
  { id: 'l7163', name: '14 par page — 99,1 × 38,1 (2 × 7)', w: 99.1, h: 38.1, cols: 2, rows: 7, top: 15.1, left: 4.6, gapX: 2.5, gapY: 0 },
  { id: 'l7651', name: '65 par page — 38,1 × 21,2 (5 × 13)', w: 38.1, h: 21.2, cols: 5, rows: 13, top: 10.7, left: 4.7, gapX: 2.5, gapY: 0 },
  { id: 'custom', name: 'Personnalisée (mesurez votre feuille)', w: 56, h: 34, cols: 3, rows: 8, top: 8, left: 8, gapX: 3, gapY: 3 }
]
export const RECEIPT_FORMATS = [
  { id: 'a4', name: 'Format A4' },
  { id: 'ticket', name: 'Ticket 80 mm (thermique)', w: 80 },
  { id: 'ticket58', name: 'Ticket 58 mm (thermique)', w: 58 },
  { id: 'ticketc', name: 'Ticket largeur personnalisée…', w: 72, custom: true }
]
// Vitesse maximale entre deux touches d'un scan (ms)
export const SCAN_SPEEDS = [
  { v: 35, name: 'Rapide — scanner USB / 2,4 GHz (ZKTeco, Honeywell Orbit…)' },
  { v: 60, name: 'Normal — la plupart des scanners' },
  { v: 100, name: 'Lent — scanner Bluetooth' },
  { v: 160, name: 'Très lent — si les scans ne sont pas reconnus' }
]

const KEY = 'tb-print'
const DEFAULTS = {
  // étiquettes
  label: 'l50x30', paper: 'gap', custom: { w: 50, h: 30 }, sheetPreset: 'p56', sheet: { w: 56, h: 34, cols: 3, rows: 8, top: 8, left: 8, gapX: 3, gapY: 3 },
  tplId: '', rotate: false, offX: 0, offY: 0, scale: 100, pad: 1.2, fontScale: 100, contour: false,
  // reçus
  receipt: '', receiptW: 72, receiptMargin: 2, receiptFont: 100, autoReceipt: false,
  // impression directe Bluetooth (ESC/POS) : colonnes ('' = selon le format), accents (CP858), coupe, lignes vides à la fin
  btCols: '', btAccents: false, btCut: false, btFeed: 3, printMethod: 'auto', lastOk: '',
  // scanner
  scanSound: true, scanGap: 35, scanMin: 4, scanPrefix: '', scanSuffix: 'auto'
}
// Formats par défaut de l'entreprise (Réglages → Logo & documents) : étiquettes produits et étiquette colis.
// Un appareil ne les écrase que s'il a choisi lui-même un format (clé listée dans __fmt).
let COMPANY = {}
export const setCompanyPrint = (p) => { COMPANY = p || {} }
const FMT_KEYS = { label: 'label', parcel: 'colis' }
export function getPrintPrefs() {
  let raw = {}
  try { raw = JSON.parse(localStorage.getItem(KEY) || '{}') } catch { raw = {} }
  const out = { ...DEFAULTS, ...raw, custom: { ...DEFAULTS.custom, ...(raw.custom || {}) }, sheet: { ...DEFAULTS.sheet, ...(raw.sheet || {}) } }
  for (const [k, ck] of Object.entries(FMT_KEYS)) if (!(raw.__fmt || []).includes(k) && COMPANY[ck]) out[k] = COMPANY[ck]
  return out
}
export function setPrintPrefs(patch) {
  const next = { ...getPrintPrefs(), ...patch }
  let was = []
  try { was = JSON.parse(localStorage.getItem(KEY) || '{}').__fmt || [] } catch { was = [] }
  next.__fmt = [...new Set([...was, ...Object.keys(FMT_KEYS).filter((k) => k in patch)])]
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* stockage indisponible */ }
  return next
}
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) && v !== '' ? Math.max(lo, Math.min(hi, n)) : d }

export function labelSize(prefs = getPrintPrefs(), id = prefs.label) {
  const f = LABEL_FORMATS.find((x) => x.id === id) || LABEL_FORMATS[3]
  if (f.sheet) { const s = prefs.sheet || DEFAULTS.sheet; return { ...f, w: num(s.w, 56, 15, 210), h: num(s.h, 34, 10, 297) } }
  if (f.custom) return { ...f, w: num(prefs.custom?.w, 50, 15, 210), h: num(prefs.custom?.h, 30, 10, 300) }
  return f
}
export function sheetGrid(prefs = getPrintPrefs()) {
  const s = prefs.sheet || DEFAULTS.sheet
  return { w: num(s.w, 56, 15, 210), h: num(s.h, 34, 10, 297), cols: Math.floor(num(s.cols, 3, 1, 12)), rows: Math.floor(num(s.rows, 8, 1, 30)), top: num(s.top, 8, 0, 100), left: num(s.left, 8, 0, 100), gapX: num(s.gapX, 3, 0, 30), gapY: num(s.gapY, 3, 0, 30) }
}
export const receiptFormat = (id) => RECEIPT_FORMATS.find((x) => x.id === id) || RECEIPT_FORMATS[0]
export const receiptWidth = (id, prefs = getPrintPrefs()) => { const f = receiptFormat(id); return f.custom ? num(prefs.receiptW, 72, 40, 120) : f.w || 0 }
export function receiptCss(id, prefs = getPrintPrefs()) {
  if (id === 'a4' || !id) return '@page { size: A4; margin: 12mm; }'
  return `@page { size: ${receiptWidth(id, prefs)}mm auto; margin: ${num(prefs.receiptMargin, 2, 0, 15)}mm; }`
}

// ---------------------------------------------------------------------------------------------
// Modèles d'étiquettes. Un modèle = thème (couleurs, cadre, bandeau) + liste ordonnée d'éléments.
// Chaque élément : { k, on, size (% de la taille de base), align (left|center|right), bold }
// ---------------------------------------------------------------------------------------------
export const EL_LABELS = { shop: 'Nom de la boutique', name: 'Nom du produit', variant: 'Variante / longueur', price: 'Prix', barcode: 'Code-barres', code: 'Code (chiffres)', extra: 'Ligne libre', date: 'Date d’impression' }
export const EL_KEYS = Object.keys(EL_LABELS)
const EL_DEF = { shop: [false, 100, 'left', false], name: [true, 100, 'left', true], variant: [true, 100, 'left', false], price: [true, 100, 'right', true], barcode: [true, 100, 'center', false], code: [true, 100, 'center', false], extra: [false, 100, 'left', false], date: [false, 100, 'right', false] }
// els : { k: [on, size, align, bold] } dans l'ordre voulu ; les éléments non cités sont ajoutés à la fin, désactivés
function mkEls(spec) {
  const out = Object.entries(spec).map(([k, v]) => { const d = EL_DEF[k]; return { k, on: v[0] ?? d[0], size: v[1] ?? d[1], align: v[2] ?? d[2], bold: v[3] ?? d[3] } })
  EL_KEYS.forEach((k) => { if (!out.some((e) => e.k === k)) { const d = EL_DEF[k]; out.push({ k, on: false, size: d[1], align: d[2], bold: d[3] }) } })
  return out
}
const T = (bg, fg, accent, frame, band, radius = 1.5) => ({ bg, fg, accent, frame, band, radius })
const C = 'center'
export const BUILTIN_TEMPLATES = [
  { id: 'standard', name: 'Standard', desc: 'Nom, variante, prix, code-barres (+ QR sur les grandes étiquettes).', theme: T('#ffffff', '#000000', '#000000', false, false), qr: true,
    els: mkEls({ shop: [false], name: [], variant: [], price: [], barcode: [], code: [], extra: [], date: [] }) },
  { id: 'elegant', name: 'Élégant doré', desc: 'Cadre doré, bandeau avec le nom de la boutique, texte centré.', theme: T('#fff9f7', '#2b1a24', '#b8862b', true, true, 2), qr: false,
    els: mkEls({ shop: [true, 115, C, true], name: [true, 115, C, true], variant: [true, 100, C], price: [true, 130, C, true], barcode: [], code: [true, 100, C], extra: [true, 100, C] }) },
  { id: 'rose', name: 'Rose glamour', desc: 'Fond rose pâle, bandeau rose, prix en évidence.', theme: T('#fde7ee', '#5b1330', '#d6336c', true, true, 2.5), qr: false,
    els: mkEls({ shop: [true, 110, C, true], name: [true, 115, C, true], variant: [true, 100, C], price: [true, 140, C, true], barcode: [], code: [true, 100, C], extra: [true, 100, C] }) },
  { id: 'noir', name: 'Noir chic', desc: 'Fond noir, texte blanc et prix doré (code-barres sur fond blanc).', theme: T('#111111', '#ffffff', '#d4af37', true, false, 2), qr: false,
    els: mkEls({ shop: [true, 105, C, true], name: [true, 115, C, true], variant: [true, 100, C], price: [true, 135, C, true], barcode: [], code: [true, 100, C], extra: [true, 100, C] }) },
  { id: 'prix', name: 'Gros prix', desc: 'Le prix en très grand : idéal pour les étagères et la vitrine.', theme: T('#ffffff', '#000000', '#000000', true, false, 1.5), qr: false,
    els: mkEls({ name: [true, 100, C, true], variant: [true, 95, C], price: [true, 270, C, true], barcode: [true, 80, C], code: [false] }) },
  { id: 'minimal', name: 'Minimal', desc: 'Seulement le nom et le code-barres.', theme: T('#ffffff', '#000000', '#000000', false, false), qr: false,
    els: mkEls({ name: [true, 100, C, true], barcode: [], code: [true, 100, C], variant: [false], price: [false] }) },
  { id: 'longueur-rouge', name: 'Longueur — rouge', desc: 'Grande longueur sur fond rouge pour reconnaître vite (couleur ; en noir et blanc sur imprimante thermique).', theme: T('#d90429', '#ffffff', '#ffffff', false, false, 1.5), qr: false,
    els: mkEls({ name: [true, 70, C, true], variant: [true, 430, C, true], price: [false], barcode: [false], code: [false] }) },
  { id: 'longueur-noir', name: 'Longueur — noir', desc: 'Grande longueur sur fond noir (très lisible sur imprimante thermique).', theme: T('#000000', '#ffffff', '#ffffff', false, false, 1.5), qr: false,
    els: mkEls({ name: [true, 70, C, true], variant: [true, 430, C, true], price: [false], barcode: [false], code: [false] }) }
]
export const DEFAULT_TPL = { shop: false, shopText: '', date: false, extra: '', codeText: true }
export const tplOf = (settings) => ({ ...DEFAULT_TPL, ...(settings?.labelTpl || {}) })
const cloneTpl = (t) => ({ ...t, theme: { ...t.theme }, els: t.els.map((e) => ({ ...e })) })
// Le modèle « Standard » reste commandé par les anciens réglages (boutique / date / ligne libre / texte du code)
function standardWith(t) {
  const s = cloneTpl(BUILTIN_TEMPLATES[0])
  const set = (k, patch) => { const e = s.els.find((x) => x.k === k); if (e) Object.assign(e, patch) }
  set('shop', { on: !!t.shop }); set('date', { on: !!t.date }); set('extra', { on: !!t.extra }); set('code', { on: t.codeText !== false })
  return s
}
export function templatesOf(settings) {
  const t = tplOf(settings)
  const custom = (Array.isArray(settings?.labelTemplates) ? settings.labelTemplates : []).filter((x) => x && x.id && Array.isArray(x.els)).map((x) => ({ ...x, builtin: false }))
  return [{ ...standardWith(t), builtin: true }, ...BUILTIN_TEMPLATES.slice(1).map((x) => ({ ...cloneTpl(x), builtin: true })), ...custom]
}
export function resolveTemplate(settings, prefs = getPrintPrefs()) {
  const all = templatesOf(settings)
  return all.find((x) => x.id === prefs.tplId) || all.find((x) => x.id === settings?.labelTplDefault) || all[0]
}
export function newCustomTemplate(from, name) {
  return { ...cloneTpl(from), id: 'tpl_' + Math.random().toString(36).slice(2, 9), name, builtin: false, desc: '' }
}
export function labelOpts(settings, prefs = getPrintPrefs()) {
  const t = tplOf(settings)
  return { pad: num(prefs.pad, 1.2, 0, 6), fontScale: num(prefs.fontScale, 100, 60, 160) / 100, contour: !!prefs.contour, shopText: t.shopText || settings?.company?.name || 'THAM BEAUTY', extra: t.extra || '', tpl: resolveTemplate(settings, prefs) }
}

// Règle @page : une étiquette = une page (imprimante thermique), ou feuille A4 (marges gérées par la grille)
export function labelPageCss(f, prefs = getPrintPrefs()) {
  if (f.sheet) return '@page { size: A4; margin: 0; }'
  return prefs.rotate ? `@page { size: ${f.h}mm ${f.w}mm; margin: 0; }` : `@page { size: ${f.w}mm ${f.h}mm; margin: 0; }`
}
// Scanner : réglages lus par le détecteur
export function scanOpts() {
  const p = getPrintPrefs()
  return { gap: num(p.scanGap, 35, 20, 400), min: Math.floor(num(p.scanMin, 4, 2, 20)), prefix: String(p.scanPrefix || ''), suffix: p.scanSuffix || 'auto', sound: p.scanSound !== false }
}
