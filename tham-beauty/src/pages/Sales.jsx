import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../lib/store.jsx'
import { convert, itemStock, round2, saleProfit, saleSummary, saleTotals } from '../lib/calc.js'
import { DELIVERY, PAY_STATUS, fdate, fdt, money, nowIso, today, uid } from '../lib/util.js'
import { Badge, Empty, Input, Modal, MoneyStat, Notice, NumberInput, PageHeader, Select, Stat, Table, payTone } from '../components/ui.jsx'
import PaymentModal from '../components/PaymentModal.jsx'

export function Sales() {
  const app = useApp()
  const [q, setQ] = useState('')
  const [ps, setPs] = useState('')
  const rows = useMemo(() => app.D.sales
    .map((s) => ({ s, r: saleSummary(s) }))
    .filter(({ s, r }) => (!ps || (ps === 'annule' ? s.status === 'annule' : s.status !== 'annule' && r.payStatus === ps)) && ((s.number || '') + (s.customerName || '')).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.s.date || '').localeCompare(a.s.date || '') || (b.s.number || '').localeCompare(a.s.number || '')), [app.D.sales, q, ps])
  return (
    <>
      <PageHeader title="Ventes">
        {app.can('sales.write') && <Link to="/ventes/nouvelle" className="btn-primary">+ Nouvelle vente</Link>}
      </PageHeader>
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input !w-56" placeholder="N° ou client…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input !w-auto" value={ps} onChange={(e) => setPs(e.target.value)}>
          <option value="">Tous les paiements</option>
          {['impaye', 'partiel', 'paye', 'trop_percu'].map((k) => <option key={k} value={k}>{PAY_STATUS[k]}</option>)}
          <option value="annule">Annulées</option>
        </select>
      </div>
      {!rows.length ? <Empty>Aucune vente.</Empty> : (
        <div className="card !p-2">
          <Table head={['N°', 'Date', 'Client', 'Net', 'Payé', 'Solde', 'Statut']}>
            {rows.map(({ s, r }) => (
              <tr key={s.id} className={s.status === 'annule' ? 'opacity-50' : ''}>
                <td className="td"><Link className="font-medium underline" to={`/ventes/${s.id}`}>{s.number}</Link></td>
                <td className="td">{fdate(s.date)}</td><td className="td">{s.customerName}</td>
                <td className="td">{money(r.netKept, s.currency)}</td><td className="td">{money(r.paid, s.currency)}</td><td className="td">{money(r.balance, s.currency)}</td>
                <td className="td">{s.status === 'annule' ? <Badge tone="red">Annulée</Badge> : <Badge tone={payTone(r.payStatus)}>{PAY_STATUS[r.payStatus]}</Badge>}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </>
  )
}

export function NewSale() {
  const app = useApp()
  const nav = useNavigate()
  const [f, setF] = useState({ customerId: '', customerName: '', date: today(), currency: 'USD', rate: String(app.rate), delivery: 'retire', globalType: 'fixed', globalValue: '', notes: '' })
  const [lines, setLines] = useState([])
  const [pay, setPay] = useState({ amount: '', currency: 'USD', rate: String(app.rate), method: 'Espèces' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const stockOptions = useMemo(() => {
    const o = []
    app.D.projects.filter((p) => !['archive', 'brouillon'].includes(p.status)).forEach((p) => {
      ;(p.items || []).forEach((it) => {
        const st = itemStock(it, app.D.sales)
        if (st.remaining > 0) o.push({ value: `${p.id}|${it.id}`, label: `${it.label} — ${p.number} (stock ${st.remaining})`, p, it, remaining: st.remaining })
      })
    })
    return o
  }, [app.D.projects, app.D.sales])

  const draft = { currency: f.currency, rate: Number(f.rate), globalDiscount: { type: f.globalType, value: Number(f.globalValue) || 0 }, lines: lines.map((l) => ({ ...l, qty: Number(l.qty) || 0, unitPrice: Number(l.unitPrice) || 0, discount: { type: l.dType, value: Number(l.dValue) || 0 } })) }
  const t = saleTotals(draft)
  const showCost = app.can('finance.read')

  function addLine(val) {
    const o = stockOptions.find((x) => x.value === val)
    if (!o) return
    const price = o.it.plannedPrice ? round2(convert(o.it.plannedPrice, o.it.plannedCurrency || 'USD', f.currency, f.rate)) : ''
    setLines([...lines, { id: uid(), projectId: o.p.id, itemId: o.it.id, label: o.it.label, sku: o.it.sku || '', qty: '1', unitPrice: String(price), dType: 'fixed', dValue: '', max: o.remaining, projectNumber: o.p.number }])
  }
  const setL = (i, k, v) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)))

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (!lines.length) return setErr('Ajoutez au moins un article.')
    const used = {}
    for (const l of draft.lines) {
      if (!(l.qty > 0)) return setErr('Quantité invalide.')
      used[l.itemId] = (used[l.itemId] || 0) + l.qty
      const lim = lines.find((x) => x.itemId === l.itemId).max
      if (used[l.itemId] > lim) return setErr(`Stock insuffisant pour « ${l.label} » (disponible : ${lim}).`)
      if (l.unitPrice <= 0) return setErr('Prix unitaire requis.')
    }
    const pct = t.discountPct
    if (pct > app.settings.discountAuth && !app.can('discount.authorize')) return setErr(`Réduction de ${round2(pct)} % : dépasse la limite (${app.settings.discountAuth} %). Une autorisation est nécessaire.`)
    if (pct > app.settings.discountWarn && !window.confirm(`Attention : réduction de ${round2(pct)} % (limite d'avertissement ${app.settings.discountWarn} %). Continuer ?`)) return
    setBusy(true)
    try {
      const number = await app.nextNumber('VTE')
      const cust = app.D.customers.find((c) => c.id === f.customerId)
      const sale = {
        number, date: f.date, createdAtIso: nowIso(), customerId: f.customerId, customerName: cust?.name || f.customerName || 'Client de passage',
        currency: f.currency, rate: Number(f.rate), delivery: f.delivery, notes: f.notes, status: 'valide',
        globalDiscount: { type: f.globalType, value: Number(f.globalValue) || 0 },
        lines: draft.lines.map((l) => ({
          id: l.id, projectId: l.projectId, itemId: l.itemId, label: l.label, sku: l.sku, qty: l.qty, unitPrice: l.unitPrice, discount: l.discount, qtyReturned: 0,
          costSnapshot: app.costing[l.projectId]?.perItem?.[l.itemId]?.unitCostRef || 0
        })),
        payments: [], returns: []
      }
      if (Number(pay.amount) > 0) {
        sale.payments.push({ id: uid(), type: 'payment', date: f.date, amount: Number(pay.amount), currency: pay.currency, rate: Number(pay.rate), method: pay.method, status: 'valide', by: app.profile?.name || '', at: nowIso() })
      }
      const id = await app.save('sales', null, sale, 'vente')
      nav(`/ventes/${id}`, { replace: true })
    } catch (ex) { setErr(ex.message) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PageHeader title="Nouvelle vente" />
      <div className="card grid gap-3 sm:grid-cols-3">
        <Select label="Client" value={f.customerId} onChange={(v) => setF({ ...f, customerId: v })} placeholder="Client de passage" options={app.D.customers.map((c) => ({ value: c.id, label: c.name }))} />
        {!f.customerId && <Input label="Nom du client (facultatif)" value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} />}
        <Input label="Date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <Select label="Devise de facturation" value={f.currency} onChange={(v) => { setF({ ...f, currency: v }); setPay({ ...pay, currency: v }) }} options={['USD', 'HTG']} />
        <NumberInput label="Taux de cette commande (HTG/USD)" value={f.rate} onChange={(v) => setF({ ...f, rate: v })} hint={`Taux général : ${app.rate}. Cette commande gardera son taux même si le taux général change.`} />
        <Select label="Livraison" value={f.delivery} onChange={(v) => setF({ ...f, delivery: v })} options={Object.entries(DELIVERY).map(([value, label]) => ({ value, label }))} />
      </div>

      <div className="card space-y-3">
        <Select label="Ajouter un article du stock" value="" onChange={addLine} placeholder={stockOptions.length ? '— choisir un article en stock —' : 'Aucun article en stock (réceptionnez un projet)'} options={stockOptions} />
        {lines.map((l, i) => (
          <div key={l.id} className="rounded-lg bg-neutral-50 p-2">
            <div className="mb-1 flex justify-between text-sm font-medium"><span>{l.label} <span className="text-xs font-normal text-neutral-500">({l.projectNumber}, dispo {l.max})</span></span><button type="button" className="text-red-600" onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <NumberInput label="Quantité" value={l.qty} onChange={(v) => setL(i, 'qty', v)} />
              <NumberInput label={`Prix unitaire (${f.currency})`} value={l.unitPrice} onChange={(v) => setL(i, 'unitPrice', v)} />
              <Select label="Réduction / unité" value={l.dType} onChange={(v) => setL(i, 'dType', v)} options={[{ value: 'fixed', label: `Montant (${f.currency})` }, { value: 'percent', label: 'Pourcentage (%)' }]} />
              <NumberInput label="Valeur" value={l.dValue} onChange={(v) => setL(i, 'dValue', v)} />
            </div>
            {showCost && app.costing[l.projectId]?.perItem?.[l.itemId] && <div className="mt-1 text-xs text-neutral-500">Coût de revient : {money(app.costing[l.projectId].perItem[l.itemId].unitCostRef, app.ref)} / unité</div>}
          </div>
        ))}
      </div>

      <div className="card space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Select label="Réduction globale" value={f.globalType} onChange={(v) => setF({ ...f, globalType: v })} options={[{ value: 'fixed', label: `Montant (${f.currency})` }, { value: 'percent', label: 'Pourcentage (%)' }]} />
          <NumberInput label="Valeur" value={f.globalValue} onChange={(v) => setF({ ...f, globalValue: v })} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Montant brut" value={money(t.gross, f.currency)} />
          <Stat label="Réductions" value={money(t.totalDiscount, f.currency)} sub={`${round2(t.discountPct)} %`} />
          <Stat label="Net à payer" value={money(t.net, f.currency)} />
        </div>
        {t.discountPct > app.settings.discountWarn && <Notice>Réduction de {round2(t.discountPct)} % : au-dessus de la limite d'avertissement ({app.settings.discountWarn} %).</Notice>}
      </div>

      {app.can('sales.pay') && (
        <div className="card">
          <div className="mb-2 font-medium">Paiement reçu maintenant (facultatif)</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NumberInput label="Montant" value={pay.amount} onChange={(v) => setPay({ ...pay, amount: v })} />
            <Select label="Devise" value={pay.currency} onChange={(v) => setPay({ ...pay, currency: v })} options={['USD', 'HTG']} />
            <NumberInput label="Taux du paiement" value={pay.rate} onChange={(v) => setPay({ ...pay, rate: v })} />
            <Select label="Moyen" value={pay.method} onChange={(v) => setPay({ ...pay, method: v })} options={['Espèces', 'MonCash', 'NatCash', 'Virement', 'Chèque', 'Carte', 'Autre']} />
          </div>
        </div>
      )}
      {err && <Notice tone="red">{err}</Notice>}
      <button className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? '…' : 'Valider la vente'}</button>
    </form>
  )
}

export function SaleDetail() {
  const { id } = useParams()
  const app = useApp()
  const [pay, setPay] = useState(null)
  const [ret, setRet] = useState(false)
  const [doc, setDoc] = useState('facture')
  const s = app.D.sales.find((x) => x.id === id)
  if (!s) return <Empty>Vente introuvable (chargement…). <Link className="underline" to="/ventes">Retour</Link></Empty>
  const r = saleSummary(s)
  const canPay = app.can('sales.pay')
  const showProfit = app.can('finance.read')
  const pr = saleProfit(s, {}, app.costing, app.ref)
  const cancelled = s.status === 'annule'
  const co = app.settings.company

  async function addPayment(p) {
    await app.save('sales', s.id, { payments: [...(s.payments || []), p] }, p.type === 'refund' ? 'remboursement' : 'paiement client')
  }
  async function cancelPayment(p) {
    const reason = window.prompt('Motif de l\'annulation (le paiement reste visible, barré) :')
    if (!reason) return
    await app.save('sales', s.id, { payments: s.payments.map((x) => (x.id === p.id ? { ...x, status: 'annule', cancelReason: reason } : x)) }, 'annulation paiement client')
  }
  async function cancelSale() {
    const reason = window.prompt('Motif de l\'annulation de la vente (les articles retournent en stock ; la vente reste archivée) :')
    if (!reason) return
    await app.save('sales', s.id, { status: 'annule', cancelReason: reason, cancelledAt: nowIso() }, 'annulation vente')
  }
  async function setDelivery(v) { await app.save('sales', s.id, { delivery: v }, 'livraison') }

  return (
    <>
      <div className="no-print mb-3 text-sm"><Link to="/ventes" className="text-neutral-500 underline">← Ventes</Link></div>
      <PageHeader title={`Vente ${s.number}`}>
        <button className="btn-ghost no-print" onClick={() => { setDoc('facture'); setTimeout(() => window.print(), 50) }}>🖨 Facture</button>
        <button className="btn-ghost no-print" onClick={() => { setDoc('recu'); setTimeout(() => window.print(), 50) }}>🖨 Reçu</button>
      </PageHeader>
      {cancelled && <div className="no-print mb-3"><Notice tone="red">Vente annulée le {fdate(s.cancelledAt)} — {s.cancelReason}</Notice></div>}

      <div className="no-print mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Net" value={money(r.netKept, s.currency)} sub={`Taux ${s.rate}`} />
        <Stat label="Payé" value={money(r.paid, s.currency)} />
        <Stat label="Solde" value={money(r.balance, s.currency)} />
        <div className="card !p-3"><div className="text-xs text-neutral-500">Paiement</div><div className="mt-1"><Badge tone={payTone(r.payStatus)}>{PAY_STATUS[r.payStatus]}</Badge></div>
          <select className="input mt-2 !py-1 text-xs" value={s.delivery || 'retire'} onChange={(e) => setDelivery(e.target.value)} disabled={cancelled || !app.can('sales.write')}>{Object.entries(DELIVERY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      </div>
      {showProfit && !cancelled && (
        <div className="no-print mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MoneyStat label="Coût des articles" v={pr.cogs} cur={app.ref} />
          <MoneyStat label="Bénéfice réalisé" v={pr.profit} cur={app.ref} signed />
          <MoneyStat label="Écart de change (paiements)" v={r.fxUSD} cur="USD" signed />
        </div>
      )}

      <div className="print-area card mb-4">
        <div className="mb-4 flex justify-between border-b pb-3">
          <div><div className="font-serif text-xl font-bold">{co.name || 'THAM BEAUTY'}</div><div className="text-xs text-neutral-600">{co.address} {co.phone && `· ${co.phone}`}</div></div>
          <div className="text-right text-sm"><div className="text-base font-semibold uppercase">{doc === 'recu' ? 'Reçu de paiement' : 'Facture'}</div><div>{s.number}</div><div>{fdate(s.date)}</div></div>
        </div>
        <div className="mb-3 text-sm">Client : <b>{s.customerName}</b></div>
        <Table head={['Article', 'Qté', 'Prix unit.', 'Réduction', 'Total']}>
          {r.lines.map((p) => (
            <tr key={p.l.id}>
              <td className="td">{p.l.label}{p.l.qtyReturned > 0 && <div className="text-xs text-red-600">retourné : {p.l.qtyReturned}</div>}</td>
              <td className="td">{p.qty}</td><td className="td">{money(p.l.unitPrice, s.currency)}</td>
              <td className="td">{p.lineDisc + p.globalShare > 0 ? '-' + money(p.lineDisc + p.globalShare, s.currency) : '—'}</td>
              <td className="td">{money(p.net, s.currency)}</td>
            </tr>
          ))}
        </Table>
        <div className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span>Montant brut</span><span>{money(r.gross, s.currency)}</span></div>
          {r.totalDiscount > 0 && <div className="flex justify-between"><span>Réductions</span><span>-{money(r.totalDiscount, s.currency)}</span></div>}
          <div className="flex justify-between border-t pt-1 font-semibold"><span>Net</span><span>{money(r.net, s.currency)}</span></div>
          {r.net !== r.netKept && <div className="flex justify-between"><span>Après retours</span><span>{money(r.netKept, s.currency)}</span></div>}
          <div className="flex justify-between"><span>Payé</span><span>{money(r.paid, s.currency)}</span></div>
          <div className="flex justify-between font-semibold"><span>Solde</span><span>{money(r.balance, s.currency)}</span></div>
          <div className="text-xs text-neutral-500">Taux de la commande : 1 USD = {s.rate} HTG</div>
        </div>
        {doc === 'recu' && (s.payments || []).filter((p) => p.status !== 'annule').length > 0 && (
          <div className="mt-4 text-sm"><div className="mb-1 font-medium">Paiements</div>
            {s.payments.filter((p) => p.status !== 'annule').map((p) => <div key={p.id}>{fdate(p.date)} — {p.type === 'refund' ? 'Remboursement' : 'Paiement'} {money(p.amount, p.currency)} ({p.method}, taux {p.rate})</div>)}
          </div>
        )}
        <div className="mt-6 text-center text-xs text-neutral-500">{co.footer}</div>
      </div>

      <div className="no-print space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Paiements</h2>
          {canPay && !cancelled && <div className="flex gap-2"><button className="btn-primary btn-sm" onClick={() => setPay('payment')}>+ Paiement</button><button className="btn-ghost btn-sm" onClick={() => setPay('refund')}>Remboursement</button></div>}</div>
        {!(s.payments || []).length ? <Empty>Aucun paiement.</Empty> : (
          <div className="card !p-2"><Table head={['Date', 'Type', 'Montant', 'Crédité', 'Moyen', '']}>
            {s.payments.map((p) => (
              <tr key={p.id} className={p.status === 'annule' ? 'opacity-50 line-through' : ''}>
                <td className="td">{fdate(p.date)}</td><td className="td">{p.type === 'refund' ? 'Remboursement' : 'Paiement'}</td>
                <td className="td">{money(p.amount, p.currency)}<div className="text-xs text-neutral-500">taux {p.rate}</div></td>
                <td className="td">{money(p.currency === s.currency ? p.amount : convert(p.amount, p.currency, s.currency, p.rate), s.currency)}</td>
                <td className="td">{p.method}</td>
                <td className="td">{canPay && p.status !== 'annule' && !cancelled && <button className="btn-ghost btn-sm" onClick={() => cancelPayment(p)}>Annuler</button>}</td>
              </tr>
            ))}
          </Table></div>
        )}
        {!cancelled && (
          <div className="flex flex-wrap gap-2">
            {(app.can('stock.write') || app.can('sales.write')) && <button className="btn-ghost" onClick={() => setRet(true)}>Enregistrer un retour</button>}
            {app.can('sales.write') && <button className="btn-danger" onClick={cancelSale}>Annuler la vente</button>}
          </div>
        )}
        {!!(s.returns || []).length && <div className="card text-sm"><b>Retours</b>{s.returns.map((x) => <div key={x.id}>{fdate(x.date)} — {x.lines.map((l) => `${l.label} ×${l.qty}`).join(', ')} {x.note && `(${x.note})`}</div>)}</div>}
      </div>

      {pay && <PaymentModal title={pay === 'refund' ? 'Remboursement' : 'Paiement client'} refund={pay === 'refund'} opCurrency={s.currency} opRate={s.rate} remaining={pay === 'refund' ? 0 : r.balance} onSave={addPayment} onClose={() => setPay(null)} />}
      {ret && <ReturnModal s={s} onClose={() => setRet(false)} />}
    </>
  )
}

function ReturnModal({ s, onClose }) {
  const app = useApp()
  const [qty, setQty] = useState({})
  const [note, setNote] = useState('')
  async function submit(e) {
    e.preventDefault()
    const lines = s.lines.map((l) => ({ lineId: l.id, label: l.label, qty: Number(qty[l.id]) || 0 })).filter((l) => l.qty > 0)
    for (const l of lines) {
      const line = s.lines.find((x) => x.id === l.lineId)
      if (l.qty > line.qty - (line.qtyReturned || 0)) return alert(`Retour trop grand pour « ${l.label} ».`)
    }
    if (!lines.length) return
    await app.save('sales', s.id, {
      lines: s.lines.map((l) => { const x = lines.find((y) => y.lineId === l.id); return x ? { ...l, qtyReturned: (l.qtyReturned || 0) + x.qty } : l }),
      returns: [...(s.returns || []), { id: uid(), date: today(), lines, note, by: app.profile?.name || '' }]
    }, 'retour client')
    onClose()
  }
  return (
    <Modal title="Retour d'articles" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {s.lines.map((l) => (
          <NumberInput key={l.id} label={`${l.label} — retournable : ${l.qty - (l.qtyReturned || 0)}`} value={qty[l.id] ?? ''} onChange={(v) => setQty({ ...qty, [l.id]: v })} />
        ))}
        <Input label="Motif" value={note} onChange={(e) => setNote(e.target.value)} />
        <Notice tone="blue">Les articles retournés reviennent en stock et le montant net de la vente diminue. Pensez à enregistrer un remboursement si vous rendez de l'argent.</Notice>
        <button className="btn-primary w-full">Enregistrer le retour</button>
      </form>
    </Modal>
  )
}
