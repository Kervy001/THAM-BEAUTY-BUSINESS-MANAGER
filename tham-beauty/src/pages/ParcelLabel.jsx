import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp } from '../lib/store.jsx'
import { fdate } from '../lib/util.js'
import { LABEL_FORMATS, getPrintPrefs, setPrintPrefs, labelPageCss } from '../lib/printing.js'
import { Barcode, QR } from '../components/CodeImages.jsx'
import Icon from '../components/Icon.jsx'
import { Empty, Input, PageHeader } from '../components/ui.jsx'

// Étiquette de colis : expéditeur, destinataire, numéro de vente, code-barres. Une étiquette par colis (1/3, 2/3…).
export default function ParcelLabel() {
  const { id } = useParams()
  const app = useApp()
  const s = app.D.sales.find((x) => x.id === id)
  const cust = s ? app.D.customers.find((c) => c.id === s.customerId) : null
  const co = app.settings.company
  const roll = LABEL_FORMATS.filter((f) => !f.sheet)
  const [prefs, setPrefs] = useState(getPrintPrefs)
  const fid = prefs.parcel || 'l100x150'
  const F = (() => { const f = roll.find((x) => x.id === fid) || roll.find((x) => x.id === 'l100x150'); return f.custom ? { ...f, w: Number(prefs.custom?.w) || 100, h: Number(prefs.custom?.h) || 150 } : f })()
  const [f, setF] = useState(null)
  useEffect(() => { if (s && !f) setF({ name: s.customerName || '', phone: cust?.phone || '', address: cust?.address || '', parcels: '1', note: '' }) }, [s, cust, f])
  useEffect(() => {
    const st = document.createElement('style')
    st.textContent = labelPageCss(F)
    document.head.appendChild(st)
    return () => st.remove()
  }, [F.w, F.h]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!s || !f) return <Empty>Vente introuvable (chargement…). <Link className="underline" to="/ventes">Retour</Link></Empty>
  const n = Math.max(1, Math.min(50, Math.floor(Number(f.parcels) || 1)))
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const big = F.h >= 90
  const fs = Math.max(7, Math.min(16, F.h * (big ? 0.075 : 0.2)))

  return (
    <>
      <div className="no-print mb-3 text-sm"><Link to={`/ventes/${s.id}`} className="text-neutral-500 underline">← Vente {s.number}</Link></div>
      <PageHeader title="Étiquette de colis" subtitle={`Vente ${s.number}`}>
        <button className="btn-gold no-print" onClick={() => window.print()}><Icon name="printer" size={16} />Imprimer ({n})</button>
      </PageHeader>
      <div className="no-print card mb-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Nom du destinataire" value={f.name} onChange={set('name')} />
          <Input label="Téléphone" value={f.phone} onChange={set('phone')} />
          <Input label="Adresse / ville de livraison" value={f.address} onChange={set('address')} />
          <Input label="Nombre de colis" type="number" min="1" max="50" value={f.parcels} onChange={set('parcels')} />
          <Input label="Note (fragile, contre remboursement…)" value={f.note} onChange={set('note')} />
          <label className="block"><span className="label">Format d’étiquette</span>
            <select className="input" value={fid} onChange={(e) => setPrefs(setPrintPrefs({ parcel: e.target.value }))}>{roll.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        </div>
        <p className="text-xs text-neutral-500">Imprimez sur votre imprimante d’étiquettes, avec le même format de papier, sans marges. <Link className="underline" to="/materiel">Aide imprimante</Link></p>
      </div>
      <div className="print-area" style={{ background: '#fff', borderRadius: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4mm', alignItems: 'flex-start' }}>
          {Array.from({ length: n }, (_, i) => (
            <div key={i} style={{ width: `${F.w}mm`, height: `${F.h}mm`, border: '0.2mm dashed #bbb', padding: '3mm', boxSizing: 'border-box', background: '#fff', color: '#000', fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column', gap: '1.5mm', overflow: 'hidden', breakAfter: i < n - 1 ? 'page' : 'auto', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: `${fs * 0.7}pt`, borderBottom: '0.4mm solid #000', paddingBottom: '1mm' }}>
                <b>{co.name || 'THAM BEAUTY'}{co.phone ? ` · ${co.phone}` : ''}</b>
                <b>Colis {i + 1}/{n}</b>
              </div>
              <div style={{ fontSize: `${fs * 0.6}pt`, textTransform: 'uppercase', letterSpacing: '0.5pt', color: '#444' }}>Destinataire</div>
              <div style={{ fontSize: `${fs * 1.3}pt`, fontWeight: 800, lineHeight: 1.1 }}>{f.name}</div>
              {f.phone && <div style={{ fontSize: `${fs}pt`, fontWeight: 700 }}>☎ {f.phone}</div>}
              {f.address && <div style={{ fontSize: `${fs}pt`, lineHeight: 1.2 }}>{f.address}</div>}
              {f.note && <div style={{ fontSize: `${fs * 0.9}pt`, fontWeight: 700, border: '0.4mm solid #000', padding: '0.8mm 1.5mm', alignSelf: 'flex-start' }}>{f.note}</div>}
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: `${fs * 0.75}pt` }}>Vente <b>{s.number}</b> · {fdate(s.date)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2mm' }}>
                <div style={{ flex: 1, minWidth: 0 }}><Barcode value={s.number} height={`${Math.max(8, F.h * (big ? 0.12 : 0.3))}mm`} /></div>
                {big && <QR value={s.number} size={`${Math.min(F.w * 0.25, 24)}mm`} />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
