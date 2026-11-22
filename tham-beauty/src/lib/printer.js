// Centre d'impression : détecte l'appareil, recommande le meilleur mode et exécute l'impression d'un reçu.
// Modes : usb / bt (direct depuis le navigateur), rawbt (Android : application RawBT), share (image à partager), dialog (fenêtre d'impression du système).
import { btPrint, btSupported, btName } from './btprint.js'
import { usbPrint, usbSupported, usbName } from './usbprint.js'
import { clean, pad2, wrap } from './escpos.js'

export function platform() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || ''
  const touch = (typeof navigator !== 'undefined' && navigator.maxTouchPoints) || 0
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1)
  const os = ios ? 'ios' : /Android/.test(ua) ? 'android' : /CrOS/.test(ua) ? 'chromeos' : /Windows/.test(ua) ? 'windows' : /Mac/.test(ua) ? 'mac' : 'autre'
  return { os, chromium: !ios && /Chrome|Chromium|Edg\//.test(ua) }
}
export const OS_LABEL = { ios: 'iPhone / iPad', android: 'Android', chromeos: 'Chromebook', windows: 'Windows', mac: 'Mac', autre: 'Ordinateur' }

export function capabilities() {
  const p = platform()
  let share = false
  try { share = typeof navigator !== 'undefined' && !!navigator.share && typeof File !== 'undefined' } catch { share = false }
  return { ...p, bt: btSupported(), usb: usbSupported(), rawbt: p.os === 'android', share, dialog: typeof window !== 'undefined' }
}

export const METHODS = {
  auto: 'Automatique (recommandé)',
  usb: 'Câble USB (direct)',
  bt: 'Bluetooth (direct)',
  rawbt: 'Application RawBT (Android)',
  share: 'Partager le reçu en image',
  dialog: 'Fenêtre d’impression du système'
}
export const methodAvailable = (m, c) => m === 'auto' || (m === 'usb' && c.usb) || (m === 'bt' && c.bt) || (m === 'rawbt' && c.rawbt) || (m === 'share' && c.share) || m === 'dialog'

// Mode choisi pour imprimer : réglage de l'appareil, sinon le dernier qui a marché, sinon le plus adapté à l'appareil
export function chooseMethod(prefs, caps) {
  const wanted = prefs?.printMethod
  if (wanted && wanted !== 'auto' && methodAvailable(wanted, caps)) return wanted
  if (prefs?.lastOk && methodAvailable(prefs.lastOk, caps)) return prefs.lastOk
  if (caps.os === 'ios') return 'dialog'
  if (caps.os === 'android') return caps.bt ? 'bt' : 'rawbt'
  if (caps.usb) return 'usb'
  if (caps.bt) return 'bt'
  return 'dialog'
}

// Explication affichée dans l'assistant (Matériel)
export function recommendation(c) {
  const label = OS_LABEL[c.os]
  if (c.os === 'ios') return { title: `${label} : Apple interdit Bluetooth et USB directs dans le navigateur`, lines: [
    'Utilisez « Partager le reçu en image » (WhatsApp, Mail, ou une application d’imprimante), ou la fenêtre d’impression si votre imprimante est compatible AirPrint.',
    'Option avancée : le navigateur gratuit Bluefy permet le Bluetooth BLE sur iPhone.'
  ] }
  if (c.os === 'android') return { title: `${label} : 2 bonnes solutions`, lines: [
    'Bluetooth direct (Chrome) si l’imprimante est de type BLE ; câble USB-C/OTG possible aussi.',
    'Si Chrome ne voit pas l’imprimante (cas fréquent, Bluetooth « Classic ») : installez l’application gratuite RawBT, associez l’imprimante dans les réglages Bluetooth du téléphone, puis choisissez « RawBT ».'
  ] }
  if (!c.chromium) return { title: `${label} : navigateur sans impression directe`, lines: ['Ouvrez l’application dans Chrome ou Edge pour imprimer en USB / Bluetooth direct, ou utilisez la fenêtre d’impression.'] }
  return { title: `${label} : le câble USB est le plus fiable`, lines: [
    'Branchez l’imprimante en USB puis choisissez « Câble USB (direct) » : la 1re fois, sélectionnez l’imprimante dans la liste.',
    'Bluetooth direct marche seulement avec les imprimantes BLE. Sous Windows, si l’USB est refusé, l’imprimante est prise par le pilote Windows : utilisez Bluetooth, ou la fenêtre d’impression.'
  ] }
}

export function friendlyError(method, e) {
  const msg = (e && e.message) || ''
  if (e && (e.name === 'NotFoundError' || /cancel|annul/i.test(msg))) return 'Aucune imprimante choisie. Réessayez et sélectionnez-la dans la liste.'
  return msg || (method === 'bt' ? 'Impression Bluetooth impossible.' : method === 'usb' ? 'Impression USB impossible.' : 'Impression impossible.')
}

export function toBase64(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
// RawBT : l'application Android reçoit les octets ESC/POS et les envoie à l'imprimante (Bluetooth Classic, BLE ou USB)
export function rawbtPrint(bytes) { window.location.href = 'rawbt:base64,' + toBase64(bytes) }

export async function sendDirect(method, bytes, { pick = false } = {}) {
  if (method === 'usb') return usbPrint(bytes, { pick })
  if (method === 'bt') return btPrint(bytes, { pick })
  if (method === 'rawbt') return rawbtPrint(bytes)
  throw new Error('Mode d’impression inconnu.')
}
export const savedPrinterName = () => usbName() || btName() || ''

// ---- Reçu en image (partage : iPhone, WhatsApp, impression par une autre application) ----
function receiptLines(m, cols) {
  const out = []
  const L = (t, o = {}) => out.push({ t, ...o })
  const co = m.company || {}
  for (const r of wrap(co.name || 'THAM BEAUTY', Math.floor(cols / 2))) L(r, { b: 1, c: 1, big: 1 })
  if (co.address) for (const r of wrap(co.address, cols)) L(r, { c: 1 })
  if (co.phone) L(co.phone, { c: 1 })
  L('')
  L(m.docTitle || 'Reçu', { b: 1, c: 1 })
  if (m.number) L(m.number, { c: 1 })
  if (m.date) L(m.date, { c: 1 })
  const sep = () => L('-'.repeat(cols))
  sep()
  if (m.customer) for (const r of wrap('Client : ' + m.customer, cols)) L(r)
  if (m.seller) for (const r of wrap('Vendeur : ' + m.seller, cols)) L(r)
  sep()
  for (const l of m.lines || []) {
    for (const r of wrap(l.label, cols)) L(r, { b: 1 })
    for (const r of pad2(`${l.qty} x ${l.unit}`, l.total, cols)) L(r)
    if (l.disc) for (const r of pad2('  Réduction', '-' + l.disc, cols)) L(r)
    if (l.returned) L(`  retourné : ${l.returned}`)
  }
  sep()
  for (const [label, value, strong] of m.totals || []) for (const r of pad2(label, value, cols)) L(r, { b: strong ? 1 : 0 })
  if ((m.payments || []).length) { sep(); L('Paiements', { b: 1 }); for (const p of m.payments) for (const r of wrap(p, cols)) L(r) }
  if (m.note) { sep(); for (const r of wrap(m.note, cols)) L(r) }
  if (m.footer) { L(''); for (const r of wrap(m.footer, cols)) L(r, { c: 1 }) }
  return out
}

export async function receiptPng(m, { cols = 32, logoUrl = '', logoPx = 150 } = {}) {
  const lines = receiptLines(m, cols)
  const fs = 26, lh = 34, pad = 20
  const cv = document.createElement('canvas')
  const ctx = cv.getContext('2d')
  ctx.font = `${fs}px "Courier New", monospace`
  const cw = ctx.measureText('M').width
  const W = Math.ceil(cols * cw + pad * 2)
  let logo = null
  if (logoUrl) {
    try {
      logo = await new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = logoUrl })
    } catch { logo = null }
  }
  const lw = logo ? Math.min(logoPx, W - pad * 2) : 0
  const lhgt = logo ? Math.round((lw * logo.height) / logo.width) + 12 : 0
  cv.width = W; cv.height = pad * 2 + lhgt + lines.length * lh + 40
  const c = cv.getContext('2d')
  c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height)
  c.fillStyle = '#000'; c.textBaseline = 'top'
  let y = pad
  if (logo) { c.drawImage(logo, (W - lw) / 2, y, lw, lhgt - 12); y += lhgt }
  for (const l of lines) {
    c.font = `${l.b ? 'bold ' : ''}${l.big ? fs + 6 : fs}px "Courier New", monospace`
    const t = clean(l.t, true, false)
    const w = c.measureText(t).width
    c.fillText(t, l.c ? Math.max(pad, (W - w) / 2) : pad, y)
    y += lh
  }
  return new Promise((ok, ko) => cv.toBlob((b) => (b ? ok(b) : ko(new Error('Image impossible à créer.'))), 'image/png'))
}

export async function shareReceipt(m, opts = {}) {
  const blob = await receiptPng(m, opts)
  const name = `recu-${String(m.number || 'vente').replace(/[^\w-]+/g, '_')}.png`
  const file = new File([blob], name, { type: 'image/png' })
  if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: m.docTitle || 'Reçu' }); return 'partagé' }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return 'téléchargé'
}
