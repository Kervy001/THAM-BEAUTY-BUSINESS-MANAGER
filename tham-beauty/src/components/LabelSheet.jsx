import { sheetGrid } from '../lib/printing.js'
import { labelSvg } from '../lib/labelExport.js'

// Une étiquette : même dessin que l'export (labelSvg), selon le modèle choisi
export function LabelCell({ l, show, w, h, o = {}, edge, fluid }) {
  const svg = labelSvg(l, show, w, h, { ...o, inline: true })
  return (
    <div className={edge ? 'label-edge' + (o.contour ? ' contour' : '') : ''} style={fluid ? { width: '100%', aspectRatio: `${w} / ${h}`, borderRadius: '1.5mm', overflow: 'hidden' } : { width: `${w}mm`, height: `${h}mm`, borderRadius: '1.5mm', overflow: 'hidden', flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
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
