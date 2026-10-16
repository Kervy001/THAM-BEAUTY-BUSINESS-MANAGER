import { useMemo, useState } from 'react'
import { deleteDoc, doc } from 'firebase/firestore'
import { db } from '../lib/firebase.js'
import { useApp } from '../lib/store.jsx'
import { convert, saleSummary } from '../lib/calc.js'
import { fdate, money, nowIso, sellerOf, today } from '../lib/util.js'
import { Badge, Empty, Notice, NumberInput, PageHeader, Select, Textarea } from '../components/ui.jsx'

const CUR = ['USD', 'HTG']
const sign = (p) => (p.type === 'refund' ? -1 : 1)

// Clôture de caisse : l'argent liquide (espèces) que chaque vendeur doit avoir en main à la fin de la journée,
// comparé à ce qu'il compte réellement. Les écarts apparaissent en rouge pour l'administrateur.
export default function Cash() {
  const app = useApp()
  const seeAll = app.isAdmin || app.can('finance.read')
  const [date, setDate] = useState(today())
  const people = useMemo(() => {
    const m = new Map()
    app.D.users.forEach((u) => m.set(u.id, u.name))
    if (app.authUser && !m.has(app.authUser.uid)) m.set(app.authUser.uid, app.profile?.name || '')
    return [...m].map(([id, name]) => ({ id, name }))
  }, [app.D.users, app.authUser, app.profile])
  const [who, setWho] = useState(app.authUser?.uid)
  const person = people.find((p) => p.id === (seeAll ? who : app.authUser.uid)) || people[0] || { id: app.authUser.uid, name: app.profile?.name || '' }
  const [counted, setCounted] = useState({ USD: '', HTG: '' })
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const day = useMemo(() => {
    const cash = { USD: 0, HTG: 0 }
    const other = {}
    app.D.sales.forEach((s) => (s.payments || []).forEach((p) => {
      if (p.status === 'annule' || p.date !== date || p.by !== person.name) return
      const v = sign(p) * (Number(p.amount) || 0)
      if (p.method === 'Espèces') cash[p.currency] = (cash[p.currency] || 0) + v
      else { const k = `${p.method} (${p.currency})`; other[k] = (other[k] || 0) + v }
    }))
    const mine = app.D.sales.filter((s) => s.date === date && s.status !== 'annule' && sellerOf(s) === person.name)
    const net = mine.reduce((t, s) => t + convert(saleSummary(s).netKept, s.currency, app.ref, s.rate), 0)
    return { cash, other, sales: mine.length, net }
  }, [app.D.sales, date, person.name, app.ref])

  const closing = app.D.cashClosings.find((c) => c.id === `${date}_${person.id}`)
  const diff = (c) => (Number(counted[c]) || 0) - (day.cash[c] || 0)

  async function close(e) {
    e.preventDefault()
    setErr('')
    if (CUR.every((c) => counted[c] === '')) return setErr('Entrez au moins un montant compté.')
    setBusy(true)
    try {
      const c = { USD: Number(counted.USD) || 0, HTG: Number(counted.HTG) || 0 }
      await app.save('cashClosings', `${date}_${person.id}`, {
        date, userId: person.id, userName: person.name, expected: day.cash, counted: c, diff: { USD: c.USD - day.cash.USD, HTG: c.HTG - day.cash.HTG },
        nonCash: day.other, salesCount: day.sales, salesNet: Math.round(day.net * 100) / 100, refCurrency: app.ref, note: note.trim(), closedAt: nowIso(), closedBy: app.profile?.name || ''
      }, 'clôture de caisse')
      app.notify('Caisse clôturée ✓')
      setCounted({ USD: '', HTG: '' }); setNote('')
    } catch (ex) { setErr(ex.code === 'permission-denied' ? 'Cette journée est déjà clôturée.' : ex.message); } finally { setBusy(false) }
  }

  const history = [...app.D.cashClosings].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (a.userName || '').localeCompare(b.userName || '')).slice(0, 40)
  const diffTxt = (d) => CUR.filter((c) => Math.abs(d?.[c] || 0) > 0.004).map((c) => `${(d[c] > 0 ? '+' : '') + money(d[c], c)}`).join(' · ')

  return (
    <>
      <PageHeader title="Clôture de caisse" subtitle="Comparez l'argent en espèces attendu et l'argent compté." />
      <div className="card mb-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="label">Journée</span><input className="input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></label>
          {seeAll ? <Select label="Vendeur" value={person.id} onChange={setWho} options={people.map((p) => ({ value: p.id, label: p.name }))} /> : <div><span className="label">Vendeur</span><div className="input !bg-paper">{person.name}</div></div>}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-paper p-3 ring-1 ring-line"><div className="text-xs text-neutral-500">Ventes du jour</div><div className="text-lg font-semibold">{day.sales}</div><div className="text-xs text-neutral-500">{money(day.net, app.ref)}</div></div>
          <div className="rounded-xl bg-paper p-3 ring-1 ring-line"><div className="text-xs text-neutral-500">Espèces attendues</div>{CUR.map((c) => <div key={c} className="font-semibold">{money(day.cash[c] || 0, c)}</div>)}</div>
        </div>
        {Object.keys(day.other).length > 0 && <div className="text-xs text-neutral-500">Autres moyens (hors caisse) : {Object.entries(day.other).map(([k, v]) => `${k} ${v}`).join(' · ')}</div>}

        {closing ? (
          <div className="space-y-2">
            <Notice tone={CUR.some((c) => Math.abs(closing.diff?.[c] || 0) > 0.004) ? 'red' : 'green'}>
              Journée clôturée par {closing.closedBy || closing.userName} — compté {CUR.map((c) => money(closing.counted?.[c] || 0, c)).join(' + ')}. {diffTxt(closing.diff) ? `Écart : ${diffTxt(closing.diff)}` : 'Aucun écart ✓'}
              {closing.note ? ` · « ${closing.note} »` : ''}
            </Notice>
            {closing.validatedBy ? <Badge tone="green">Validée par {closing.validatedBy}</Badge> : app.isAdmin && (
              <div className="flex gap-2">
                <button className="btn-gold btn-sm" onClick={() => app.save('cashClosings', closing.id, { validatedBy: app.profile?.name || '', validatedAt: nowIso() }, 'validation clôture de caisse')}>Valider</button>
                <button className="btn-ghost btn-sm" onClick={() => confirm('Rouvrir cette journée ? La clôture sera supprimée.') && app.write(deleteDoc(doc(db, 'cashClosings', closing.id)))}>Rouvrir</button>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={close} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {CUR.map((c) => <NumberInput key={c} label={`Compté en caisse (${c})`} value={counted[c]} onChange={(v) => setCounted({ ...counted, [c]: v })} hint={counted[c] !== '' ? (Math.abs(diff(c)) < 0.005 ? 'Aucun écart ✓' : `Écart ${diff(c) > 0 ? '+' : ''}${money(diff(c), c)}`) : ''} />)}
            </div>
            <Textarea label="Remarque (facultatif)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            {err && <Notice tone="red">{err}</Notice>}
            <button className="btn-gold w-full" disabled={busy}>{busy ? '…' : 'Clôturer la journée'}</button>
            <p className="text-xs text-neutral-500">Une fois clôturée, la journée ne peut être modifiée que par l'administrateur.</p>
          </form>
        )}
      </div>

      <h2 className="section-title">{seeAll ? 'Dernières clôtures' : 'Mes dernières clôtures'}</h2>
      {!history.length ? <Empty icon="wallet">Aucune clôture pour le moment.</Empty> : (
        <div className="space-y-2">
          {history.map((c) => {
            const d = diffTxt(c.diff)
            return (
              <button key={c.id} type="button" onClick={() => { setDate(c.date); if (seeAll) setWho(c.userId) }} className="card flex w-full items-center justify-between gap-3 !p-3 text-left">
                <div><div className="font-medium">{fdate(c.date)} — {c.userName}</div><div className="text-xs text-neutral-500">{c.salesCount} vente(s) · compté {CUR.map((x) => money(c.counted?.[x] || 0, x)).join(' + ')}</div></div>
                <div className="text-right text-sm">{d ? <span className="font-semibold text-blush-600">{d}</span> : <Badge tone="green">OK</Badge>}{c.validatedBy && <div className="text-[11px] text-neutral-500">validée</div>}</div>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
