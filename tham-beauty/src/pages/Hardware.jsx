import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../lib/store.jsx'
import { lookupCode } from '../lib/codes.js'
import { useWedgeScanner } from '../lib/wedge.js'
import { scanBeep } from '../lib/alerts.js'
import { LABEL_FORMATS, PAPER_TYPES, RECEIPT_FORMATS, SCAN_SPEEDS, SHEET_PRESETS, getPrintPrefs, setPrintPrefs, labelSize, labelOpts, labelPageCss, receiptCss, receiptWidth, sheetGrid } from '../lib/printing.js'
import { LabelCell, LabelPages } from '../components/LabelSheet.jsx'
import LabelTemplates from '../components/LabelTemplates.jsx'
import Icon from '../components/Icon.jsx'
import { Notice, NumInput, PageHeader } from '../components/ui.jsx'

const Field = ({ label, children, hint }) => <label className="block"><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-[11px] text-neutral-500">{hint}</span>}</label>
const NumIn = ({ value, onChange, min, max }) => <NumInput value={value} onChange={onChange} min={min} max={max} />

// Matériel : configuration de base du scanner, de l'imprimante d'étiquettes et de l'imprimante de reçus (propre à cet appareil).
export default function Hardware({ embedded = false }) {
  const app = useApp()
  const [prefs, setPrefs] = useState(getPrintPrefs)
  const [scans, setScans] = useState([])
  const t0 = useRef(0)
  const set = (patch) => setPrefs(setPrintPrefs(patch))
  const F = labelSize(prefs)
  const O = labelOpts(app.settings, prefs)
  const isSheet = prefs.label === 'a4'
  const G = sheetGrid(prefs)
  const paper = PAPER_TYPES.find((x) => x.id === prefs.paper) || PAPER_TYPES[0]
  const recId = prefs.receipt || 'ticket'

  useWedgeScanner((code) => {
    const f = lookupCode(code, app.D.products)
    if (prefs.scanSound) scanBeep(!!f)
    setScans((l) => [{ code, at: new Date().toLocaleTimeString('fr-FR'), found: f ? `${f.product.name}${f.variant ? ' — ' + f.variant.label : ''}` : '' }, ...l].slice(0, 8))
  })

  function printTest(kind) {
    const css = kind === 'receipt' ? receiptCss(recId, prefs) : labelPageCss(F, prefs)
    const st = document.createElement('style')
    st.textContent = css
    document.head.appendChild(st)
    document.body.classList.add(kind === 'receipt' ? 'print-test-receipt' : 'print-test-label')
    document.body.dataset.testKind = kind
    setTimeout(() => { window.print(); setTimeout(() => { st.remove(); document.body.classList.remove('print-test-label', 'print-test-receipt'); delete document.body.dataset.testKind }, 800) }, 200)
  }
  const demo = { name: 'THAM BEAUTY', label: 'Test impression', code: 'TB123456', price: 12.5, cur: 'USD', key: 'demo' }
  const show = { barcode: true, qr: true, price: true }
  const demoLabels = isSheet ? Array.from({ length: G.cols * G.rows }, (_, i) => ({ ...demo, key: 'd' + i, label: `Étiquette ${i + 1}` })) : [demo]
  const Oalign = { ...O, contour: true }
  const sheetPreset = (id) => { const p = SHEET_PRESETS.find((x) => x.id === id); if (p) set({ sheetPreset: id, sheet: { w: p.w, h: p.h, cols: p.cols, rows: p.rows, top: p.top, left: p.left, gapX: p.gapX, gapY: p.gapY } }) }
  const setSheet = (k, v) => set({ sheetPreset: 'custom', sheet: { ...prefs.sheet, [k]: v } })

  return (
    <>
      {!embedded && <PageHeader title="Scanner & imprimante" subtitle="Réglages propres à cet appareil (téléphone, tablette, ordinateur)." />}
      {embedded && <p className="mb-3 text-sm text-neutral-600">Ces réglages sont propres à l’appareil que vous utilisez en ce moment (chaque téléphone / ordinateur a son scanner et son imprimante). Le modèle d’étiquette est commun à toute l’entreprise.</p>}

      {/* ---------------- SCANNER ---------------- */}
      <section className="card mb-5 space-y-3 no-print">
        <h3 className="font-display text-base font-semibold"><Icon name="scan" size={18} className="mr-1 inline" />Scanner de codes-barres</h3>
        <p className="text-sm text-neutral-600">Les scanners USB, Bluetooth et 2,4 GHz (ZKTeco, Honeywell Orbit…) agissent comme un clavier : <b>rien à installer</b>. Dans <b>Nouvelle vente</b>, <b>Inventaire</b> et <b>Stock</b>, chaque scan est reçu automatiquement. Le bouton « Scanner » (caméra du téléphone) reste disponible.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Vitesse du scanner" hint="Si certains scans ne sont pas reconnus, choisissez plus lent."><select className="input" value={prefs.scanGap} onChange={(e) => set({ scanGap: Number(e.target.value) })}>{SCAN_SPEEDS.map((s) => <option key={s.v} value={s.v}>{s.name}</option>)}</select></Field>
          <Field label="Fin de code (suffixe)" hint="Par défaut les scanners envoient « Entrée »."><select className="input" value={prefs.scanSuffix} onChange={(e) => set({ scanSuffix: e.target.value })}><option value="auto">Automatique (Entrée ou Tab)</option><option value="enter">Entrée seulement</option><option value="tab">Tab seulement</option><option value="none">Aucun (fin détectée par le temps)</option></select></Field>
          <Field label="Longueur minimale du code"><NumIn value={prefs.scanMin} min="2" max="20" step="1" onChange={(v) => set({ scanMin: v })} /></Field>
          <Field label="Préfixe à ignorer (facultatif)" hint="Si votre scanner ajoute des caractères au début."><input className="input" value={prefs.scanPrefix} onChange={(e) => set({ scanPrefix: e.target.value })} /></Field>
          <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={!!prefs.scanSound} onChange={(e) => set({ scanSound: e.target.checked })} />Bip à chaque scan (aigu = reconnu, grave = inconnu)</label>
        </div>
        <label className="block"><span className="label">Zone de test : scannez un produit</span>
          <input className="input" readOnly placeholder="Scannez un code-barres : il apparaît dans la liste ci-dessous" onFocus={() => { t0.current = performance.now() }} /></label>
        {!scans.length ? <Notice tone="blue">Aucun scan reçu pour l’instant.</Notice> : (
          <div className="divide-y divide-line/70 rounded-xl ring-1 ring-line">
            {scans.map((x, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0"><div className="truncate font-mono">{x.code}</div><div className={'truncate text-xs ' + (x.found ? 'text-emerald-700' : 'text-blush-600')}>{x.found ? '✓ ' + x.found : 'Code non trouvé dans vos produits'}</div></div>
                <span className="shrink-0 text-xs text-neutral-500">{x.at}</span>
              </div>
            ))}
          </div>
        )}
        <details className="text-sm text-neutral-600">
          <summary className="cursor-pointer font-medium">Compatibilité par appareil</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><b>Ordinateur portable / Chromebook :</b> branchez le scanner (USB, ou la clé 2,4 GHz) : il fonctionne tout de suite.</li>
            <li><b>Android :</b> scanner Bluetooth (mode « HID / clavier ») jumelé, ou scanner USB / clé 2,4 GHz avec un adaptateur USB-OTG.</li>
            <li><b>iPhone / iPad :</b> seulement un scanner <b>Bluetooth en mode clavier (HID)</b>. La clé USB 2,4 GHz ne fonctionne pas sur iPhone. Sinon, la caméra.</li>
            <li>Si les chiffres s’écrivent mal (&amp; é " ' à la place de 1 2 3 4…), réglez le scanner en clavier US/QWERTY.</li>
          </ul>
        </details>
      </section>

      {/* ---------------- IMPRIMANTE D'ÉTIQUETTES ---------------- */}
      <section className="card mb-5 space-y-4 no-print">
        <h3 className="font-display text-base font-semibold"><Icon name="printer" size={18} className="mr-1 inline" />Imprimante d’étiquettes autocollantes</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type de papier" hint={paper.help}><select className="input" value={prefs.paper} onChange={(e) => { const v = e.target.value; set({ paper: v, ...(v === 'sheet' ? { label: 'a4' } : prefs.label === 'a4' ? { label: 'l50x30' } : {}) }) }}>{PAPER_TYPES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <Field label="Format d’étiquette (par défaut)"><select className="input" value={prefs.label} onChange={(e) => set({ label: e.target.value })}>{LABEL_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
          {prefs.label === 'custom' && <>
            <Field label="Largeur (mm)"><NumIn value={prefs.custom?.w ?? 50} min="15" max="210" onChange={(v) => set({ custom: { ...prefs.custom, w: v } })} /></Field>
            <Field label="Hauteur (mm)"><NumIn value={prefs.custom?.h ?? 30} min="10" max="300" onChange={(v) => set({ custom: { ...prefs.custom, h: v } })} /></Field>
          </>}
        </div>

        {isSheet && (
          <div className="space-y-3 rounded-2xl bg-paper p-3 ring-1 ring-line">
            <div className="text-sm font-medium">Votre feuille A4 d’étiquettes</div>
            <Field label="Modèle de feuille"><select className="input" value={prefs.sheetPreset} onChange={(e) => sheetPreset(e.target.value)}>{SHEET_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[['cols', 'Colonnes'], ['rows', 'Lignes'], ['w', 'Largeur étiquette (mm)'], ['h', 'Hauteur étiquette (mm)'], ['top', 'Marge haut (mm)'], ['left', 'Marge gauche (mm)'], ['gapX', 'Espace horizontal (mm)'], ['gapY', 'Espace vertical (mm)']].map(([k, l]) => (
                <Field key={k} label={l}><NumIn value={prefs.sheet?.[k] ?? ''} min="0" onChange={(v) => setSheet(k, v)} /></Field>
              ))}
            </div>
            <p className="text-xs text-neutral-500">{G.cols * G.rows} étiquettes par feuille. Mesurez avec une règle : marge haut/gauche = distance du bord de la feuille à la première étiquette.</p>
          </div>
        )}

        <details className="rounded-2xl bg-paper p-3 ring-1 ring-line">
          <summary className="cursor-pointer text-sm font-medium">Réglages avancés (alignement, rotation, taille)</summary>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Décalage horizontal (mm)" hint="+ = vers la droite"><NumIn value={prefs.offX} min="-20" max="20" step="0.1" onChange={(v) => set({ offX: v })} /></Field>
            <Field label="Décalage vertical (mm)" hint="+ = vers le bas"><NumIn value={prefs.offY} min="-20" max="20" step="0.1" onChange={(v) => set({ offY: v })} /></Field>
            <Field label="Échelle (%)" hint="100 = taille réelle"><NumIn value={prefs.scale} min="50" max="150" step="1" onChange={(v) => set({ scale: v })} /></Field>
            <Field label="Marge intérieure (mm)"><NumIn value={prefs.pad} min="0" max="6" step="0.1" onChange={(v) => set({ pad: v })} /></Field>
            <Field label="Taille du texte (%)"><NumIn value={prefs.fontScale} min="60" max="160" step="5" onChange={(v) => set({ fontScale: v })} /></Field>
            {!isSheet && <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={!!prefs.rotate} onChange={(e) => set({ rotate: e.target.checked })} />Pivoter de 90° (si l’imprimante tourne l’étiquette)</label>}
            <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={!!prefs.contour} onChange={(e) => set({ contour: e.target.checked })} />Tracer le contour (feuille à découper)</label>
          </div>
          <p className="mt-2 text-xs text-neutral-500">Densité (noirceur) et vitesse d’impression se règlent dans le pilote de l’imprimante, pas dans l’application.</p>
        </details>

        <LabelTemplates prefs={prefs} onUse={(id) => set({ tplId: id })} F={F} />

        <div className="rounded-xl bg-paper p-3 ring-1 ring-line"><div className="mb-1 text-xs text-neutral-500">Aperçu d’une étiquette ({F.w} × {F.h} mm)</div><div className="overflow-x-auto"><LabelCell l={demo} show={show} w={F.w} h={F.h} o={O} edge /></div></div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-gold" onClick={() => printTest('label')}><Icon name="printer" size={16} />Imprimer une étiquette test</button>
          <button className="btn-ghost" onClick={() => { set({ contour: true }); printTest('label') }}>Test d’alignement (avec contour)</button>
          <Link className="btn-ghost" to="/etiquettes">Étiquettes des produits</Link>
        </div>
      </section>

      {/* ---------------- IMPRIMANTE DE REÇUS ---------------- */}
      <section className="card mb-5 space-y-3 no-print">
        <h3 className="font-display text-base font-semibold"><Icon name="receipt" size={18} className="mr-1 inline" />Imprimante de reçus (après la vente)</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Largeur du papier"><select className="input" value={prefs.receipt} onChange={(e) => set({ receipt: e.target.value })}><option value="">Selon les réglages de l’entreprise</option>{RECEIPT_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
          {prefs.receipt === 'ticketc' && <Field label="Largeur (mm)"><NumIn value={prefs.receiptW} min="40" max="120" step="1" onChange={(v) => set({ receiptW: v })} /></Field>}
          <Field label="Marges (mm)"><NumIn value={prefs.receiptMargin} min="0" max="15" step="0.5" onChange={(v) => set({ receiptMargin: v })} /></Field>
          <Field label="Taille du texte (%)"><NumIn value={prefs.receiptFont} min="70" max="150" step="5" onChange={(v) => set({ receiptFont: v })} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!prefs.autoReceipt} onChange={(e) => set({ autoReceipt: e.target.checked })} />Ouvrir l’impression du reçu automatiquement après chaque vente (sur cet appareil)</label>
        <p className="text-xs text-neutral-500">Logo et pied de page du reçu : Paramètres → Réglages. Coupe automatique et tiroir-caisse : à régler dans le pilote de l’imprimante.</p>
        <button className="btn-ghost" onClick={() => printTest('receipt')}><Icon name="printer" size={16} />Imprimer un reçu test</button>
      </section>

      <section className="card no-print">
        <h3 className="mb-2 font-display text-base font-semibold">Brancher l’imprimante</h3>
        <p className="mb-2 text-sm text-neutral-600">L’application imprime par la fenêtre d’impression de l’appareil : elle fonctionne avec toute imprimante thermique (étiquettes ou tickets) que l’appareil connaît : Zebra, Brother QL, Xprinter, Munbyn, TSC, Epson TM, Rongta, HPRT, Godex…</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-600">
          <li><b>Windows / Mac :</b> installez le pilote, puis choisissez l’imprimante (papier = taille de l’étiquette, marges : aucune, échelle 100 %).</li>
          <li><b>Chromebook :</b> Paramètres → Imprimantes (modèles USB/réseau compatibles). Sinon, utilisez un ordinateur.</li>
          <li><b>Android :</b> installez le service d’impression ou l’application du fabricant.</li>
          <li><b>iPhone / iPad :</b> AirPrint ou imprimante réseau Wi-Fi seulement. Une imprimante Bluetooth qui exige sa propre application : utilisez « Image PNG / PDF » dans la page Étiquettes, puis ouvrez le fichier dans cette application.</li>
          <li>Étiquettes de colis (100 × 150 mm) : ouvrez une vente → « Étiquette colis ».</li>
        </ul>
      </section>

      {/* zone imprimée par les boutons « test » */}
      <div className="print-area print-test-zone" style={{ background: '#fff', color: '#000' }}>
        <div className="only-label"><LabelPages labels={demoLabels} show={show} prefs={prefs} F={F} o={document.body?.dataset?.testKind === 'label' && prefs.contour ? Oalign : O} /></div>
        <div className="only-receipt" style={{ fontFamily: 'monospace', fontSize: `${12 * (Number(prefs.receiptFont) || 100) / 100}px`, width: recId === 'a4' ? '100%' : `${receiptWidth(recId, prefs) - 2 * (Number(prefs.receiptMargin) || 0)}mm` }}>
          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.25em' }}>{app.settings.company?.name || 'THAM BEAUTY'}</div>
          <div style={{ textAlign: 'center' }}>Reçu de test</div>
          <hr />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Produit exemple ×1</span><span>12,50 $</span></div>
          <hr />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>TOTAL</span><span>12,50 $</span></div>
          <div style={{ textAlign: 'center', marginTop: 6 }}>{app.settings.company?.footer || 'Merci !'}</div>
        </div>
      </div>
    </>
  )
}
