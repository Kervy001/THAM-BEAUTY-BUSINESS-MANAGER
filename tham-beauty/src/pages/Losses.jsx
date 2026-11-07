import { useMemo, useState } from 'react'
import { arrayUnion } from 'firebase/firestore'
import { useApp } from '../lib/store.jsx'
import { round2 } from '../lib/calc.js'
import { bundleCandidates } from '../lib/bundles.js'
import { fdate, nowIso, today, uid } from '../lib/util.js'
import { Badge, Empty, Input, Modal, Notice, NumberInput, PageHeader, Select, Table, useMoney } from '../components/ui.jsx'

export const LOSS_REASONS = ['Cassé / abîmé', 'Volé', 'Perdu', 'Expiré', 'Échantillon offert', 'Autre']

// Pertes de stock : retire la quantité du stock et compte sa valeur (au coût de revient) dans le résultat.
export default function Losses() {
  const app = useApp()
  const fm = useMoney()
  const ref = app.ref
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const rows = useMemo(() => {
    const out = []
    ;(app.D.projects || []).forEach((p) => (p.items || []).forEach((it) => (it.adjustments || []).filter((a) => a.kind === 'loss').forEach((a) => {
      const unit = Number(a.unitCostRef) || app.costing?.[p.id]?.perItem?.[it.id]?.unitCostRef || 0
      out.push({ ...a, pid: p.id, projectNumber: p.number, itemLabel: it.label, value: round2(-Number(a.qty) * unit) })
    })))
    return out.sort((a, b) => String(b.date || b.at).localeCompare(String(a.date || a.at)))
  }, [app.D.projects, app.costing])
  const valid = rows.filter((r) => !r.cancelled)
  const total = valid.reduce((t, r) => t + r.value, 0)
  const byReason = {}
  valid.forEach((r) => { byReason[r.reason] = (byReason[r.reason] || 0) + r.value })
  const list = rows.filter((r) => !reason || r.reason === reason)

  async function cancel(r) {
    const why = window.prompt('Motif de l’annulation (la quantité retourne en stock) :')
    if (!why) return
    const p = app.D.projects.find((x) => x.id === r.pid)
    if (!p) return
    const items = (p.items || []).map((it) => ({ ...it, adjustments: (it.adjustments || []).map((a) => (a.id === r.id ? { ...a, cancelled: true, cancelReason: why, cancelledBy: app.profile?.name || '' } : a)) }))
    try { await app.save('projects', p.id, { items, history: arrayUnion({ at: nowIso(), by: app.profile?.name || '', text: `Perte annulée : ${r.itemLabel} ×${-r.qty} — ${why}` }) }, 'perte de stock annulée') } catch (ex) { app.notify(ex.message, 'error') }
  }

  return (
    <>
      <PageHeader title="Pertes de stock" subtitle="Cassé, volé, expiré, échantillon offert… La quantité sort du stock et la valeur compte dans le résultat.">
        <button className="btn-gold" onClick={() => setOpen(true)}>Déclarer une perte</button>
      </PageHeader>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card"><div className="text-xs text-neutral-500">Total des pertes</div><div className="mt-1 text-xl font-bold text-blush-600">{fm(total, ref)}</div></div>
        {Object.entries(byReason).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => <div key={k} className="card"><div className="text-xs text-neutral-500">{k}</div><div className="mt-1 text-lg font-semibold">{fm(v, ref)}</div></div>)}
      </div>
      <div className="mb-3 max-w-xs"><Select label="Motif" value={reason} onChange={setReason} options={[{ value: '', label: 'Tous' }, ...LOSS_REASONS.map((r) => ({ value: r, label: r }))]} /></div>
      <div className="card !p-2">
        {!list.length ? <Empty>Aucune perte enregistrée.</Empty> : (
          <Table head={['Date', 'Article', 'Qté', 'Motif', 'Valeur', 'Par', '']}>
            {list.map((r) => (
              <tr key={r.id} className={r.cancelled ? 'opacity-50' : ''}>
                <td className="td whitespace-nowrap">{fdate(r.date || r.at)}</td>
                <td className="td text-sm">{r.itemLabel}<div className="text-[11px] text-neutral-500">{r.projectNumber}{r.note ? ' · ' + r.note : ''}</div></td>
                <td className="td">{-r.qty}</td>
                <td className="td text-xs">{r.reason}{r.cancelled && <Badge tone="red">annulée</Badge>}</td>
                <td className={'td whitespace-nowrap font-medium ' + (r.cancelled ? 'line-through' : '')}>{fm(r.value, ref)}</td>
                <td className="td text-xs">{r.by}</td>
                <td className="td">{!r.cancelled && <button className="btn-ghost btn-sm" onClick={() => cancel(r)}>Annuler</button>}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
      {open && <LossModal onClose={() => setOpen(false)} />}
    </>
  )
}

function LossModal({ onClose }) {
  const app = useApp()
  const ref = app.ref
  const cands = useMemo(() => Object.values(bundleCandidates(app.D, app.costing, { currency: ref, rate: app.rate, ref })).sort((a, b) => a.label.localeCompare(b.label)), [app.D, app.costing, ref, app.rate])
  const [f, setF] = useState({ itemId: '', qty: '1', reason: LOSS_REASONS[0], note: '', date: today(), q: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))
  const c = cands.find((x) => x.itemId === f.itemId)
  const shown = cands.filter((x) => !f.q || `${x.label} ${x.sku}`.toLowerCase().includes(f.q.toLowerCase())).slice(0, 60)
  const qty = Math.floor(Number(f.qty) || 0)

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (!c) return setErr('Choisissez un article.')
    if (qty < 1) return setErr('Entrez une quantité.')
    if (qty > c.remaining) return setErr(`Stock insuffisant : ${c.remaining} disponible.`)
    const p = app.D.projects.find((x) => x.id === c.projectId)
    if (!p) return
    setBusy(true)
    try {
      const at = nowIso(), by = app.profile?.name || ''
      const adj = { id: uid(), kind: 'loss', qty: -qty, reason: f.reason, note: f.note.trim(), date: f.date, at, by, unitCostRef: round2(c.unitCost) }
      const items = (p.items || []).map((it) => (it.id === c.itemId ? { ...it, adjustments: [...(it.adjustments || []), adj] } : it))
      await app.save('projects', p.id, { items, history: arrayUnion({ at, by, text: `Perte de stock : ${c.label} ×${qty} (${f.reason})` }) }, `perte de stock : ${c.label} ×${qty} (${f.reason})`)
      onClose()
    } catch (ex) { setErr(ex.message); setBusy(false) }
  }
  return (
    <Modal title="Déclarer une perte" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Chercher un article" value={f.q} onChange={(e) => set('q')(e.target.value)} placeholder="nom ou code" />
        <Select label="Article (en stock)" value={f.itemId} onChange={set('itemId')} options={[{ value: '', label: 'Choisir…' }, ...shown.map((x) => ({ value: x.itemId, label: `${x.label} — ${x.projectNumber} (${x.remaining} en stock)` }))]} />
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Quantité perdue" value={f.qty} onChange={set('qty')} />
          <Input label="Date" type="date" value={f.date} onChange={(e) => set('date')(e.target.value)} />
        </div>
        <Select label="Motif" value={f.reason} onChange={set('reason')} options={LOSS_REASONS} />
        <Input label="Note" value={f.note} onChange={(e) => set('note')(e.target.value)} />
        {c && qty > 0 && <Notice tone="amber">Valeur de la perte : <b>{round2(qty * c.unitCost)} {ref}</b> (coût de revient).</Notice>}
        {err && <Notice tone="red">{err}</Notice>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? '…' : 'Enregistrer la perte'}</button>
      </form>
    </Modal>
  )
}
