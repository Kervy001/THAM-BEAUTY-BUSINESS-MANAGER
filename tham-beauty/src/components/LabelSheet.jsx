import { money } from '../lib/util.js'
import { sheetGrid } from '../lib/printing.js'
import { Barcode, QR } from './CodeImages.jsx'

// Une étiquette : s'adapte à la taille (petites étiquettes = nom + code-barres ; grandes = + QR, code, boutique, date, ligne libre)
export function LabelCell({ l, show, w, h, o = {}, edge }) {
  const small = h < 24
  const k = o.fontScale || 1
  const fs = Math.max(6, Math.min(11, h * 0.27)) * k
  const bh = Math.max(7, h * (small ? 0.44 : 0.38)) * (k > 1.2 ? 0.85 : 1)
  const withQr = !small && show.qr && w >= 45
  const qrSize = Math.min(h * 0.5, w * 0.3, 22)
  const rich = !small && h >= 28
  const today = new Date().toLocaleDateString('fr-FR')
  return (
    <div className={edge ? 'label-edge' + (o.contour ? ' contour' : '') : ''} style={{ width: `${w}mm`, height: `${h}mm`, borderRadius: '1.5mm', padding: `${o.pad ?? 1.2}mm`, boxSizing: 'border-box', background: '#fff', color: '#000', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'Arial, sans-serif', flexShrink: 0 }}>
      {rich && o.shop && <div style={{ fontSize: `${fs * 0.7}pt`, letterSpacing: '0.6pt', textTransform: 'uppercase', color: '#333', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.shop}</div>}
      <div style={{ fontSize: `${fs}pt`, fontWeight: 700, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: `${fs * 0.88}pt`, lineHeight: 1.2 }}>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.label}</span>
        {show.price && Number(l.price) > 0 && <b style={{ whiteSpace: 'nowrap' }}>{money(l.price, l.cur)}</b>}
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1.5mm', minHeight: 0, marginTop: '0.4mm' }}>
        {show.barcode && <div style={{ flex: 1, minWidth: 0 }}><Barcode value={l.code} height={`${bh}mm`} /></div>}
        {withQr && <QR value={l.code} size={`${qrSize}mm`} />}
      </div>
      {!small && o.codeText !== false && <div style={{ fontSize: `${fs * 0.78}pt`, textAlign: 'center', letterSpacing: '0.5pt', lineHeight: 1.15 }}>{l.code}</div>}
      {rich && (o.extra || o.date) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2mm', fontSize: `${fs * 0.7}pt`, lineHeight: 1.15, color: '#222' }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.extra}</span>
          {o.date && <span style={{ whiteSpace: 'nowrap' }}>{today}</span>}
        </div>
      )}
    </div>
  )
}

const shift = (prefs) => ({ transform: `translate(${Number(prefs.offX) || 0}mm, ${Number(prefs.offY) || 0}mm) scale(${(Number(prefs.scale) || 100) / 100})`, transformOrigin: 'top left' })

// Toutes les étiquettes, prêtes à imprimer : une par page (rouleau, avec rotation éventuelle) ou en grille sur des feuilles A4
export function LabelPages({ labels, show, prefs, F, o }) {
  if (F.sheet) {
    const G = sheetGrid(prefs)
    const per = G.cols * G.rows
    const pages = []
    for (let i = 0; i < labels.length; i += per) pages.push(labels.slice(i, i + per))
    return (
      <div className="overflow-x-auto">
        {pages.map((pg, pi) => (
          <div key={pi} className="label-wrap" style={{ width: '210mm', height: '297mm', boxSizing: 'border-box', padding: `${G.top}mm 0 0 ${G.left}mm`, background: '#fff', overflow: 'hidden', breakAfter: pi < pages.length - 1 ? 'page' : 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${G.cols}, ${G.w}mm)`, gridAutoRows: `${G.h}mm`, columnGap: `${G.gapX}mm`, rowGap: `${G.gapY}mm`, alignContent: 'start', ...shift(prefs) }}>
              {pg.map((l, i) => <LabelCell key={l.key + i} l={l} show={show} w={G.w} h={G.h} o={o} edge />)}
            </div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      {labels.map((l, i) => {
        const last = i === labels.length - 1
        const outer = prefs.rotate ? { w: F.h, h: F.w } : { w: F.w, h: F.h }
        return (
          <div key={l.key + i} className="label-wrap" style={{ width: `${outer.w}mm`, height: `${outer.h}mm`, position: 'relative', overflow: 'hidden', breakAfter: last ? 'auto' : 'page', flexShrink: 0, background: '#fff' }}>
            <div style={prefs.rotate ? { position: 'absolute', top: 0, left: `${F.h}mm`, transformOrigin: 'top left', transform: `rotate(90deg) translate(${Number(prefs.offX) || 0}mm, ${Number(prefs.offY) || 0}mm) scale(${(Number(prefs.scale) || 100) / 100})` } : { ...shift(prefs) }}>
              <LabelCell l={l} show={show} w={F.w} h={F.h} o={o} edge />
            </div>
          </div>
        )
      })}
    </div>
  )
}
