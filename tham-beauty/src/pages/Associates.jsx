import { useMemo, useState } from 'react'
import { useApp } from '../lib/store.jsx'
import { convert, round2 } from '../lib/calc.js'
import { PARTNER_MOVES, partnerStatement, partnersOf } from '../lib/partners.js'
import { fdate, nowIso, today, uid } from '../lib/util.js'
import { Badge, Empty, Input, Modal, Notice, NumberInput, PageHeader, PrivacyCtx, Select, Table, useMoney, usePrivacy } from '../components/ui.jsx'

export default function Associates() {
  const [hidden] = usePrivacy()
  return <PrivacyCtx.Provider value={hidden}><AssociatesInner /></PrivacyCtx.Provider>
}

function AssociatesInner() {
  const app = useApp()
  const fm = useMoney()
  const ref = app.ref
  const partners = partnersOf(app.settings)
  const [until, setUntil] = useState('')
  const [modal, setModal] = useState(null) // { kind:'reimburse'|'distribute', partnerId? } | 'manage'
  const S = useMemo(() => partnerStatement(app.D, ref, partners, { until }), [app.D, ref, partners, until])
  const all = S.flatMap((g) => g.moves.map((m) => ({ ...m, who: g.name }))).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const tot = S.reduce((t, g) => ({ c: t.c + g.contributed, r: t.r + g.reimbursed, d: t.d + g.distributed, due: t.due + g.due }), { c: 0, r: 0, d: 0, due: 0 })

  async function cancel(m) {
    const reason = window.prompt('Motif de l’annulation (le mouvement reste visible, barré) :')
    if (!reason) return
    try { await app.save('partnerMoves', m.id, { status: 'annule', cancelReason: reason }, 'mouvement associé annulé') } catch (ex) { app.notify(ex.message, 'error') }
  }

  return (
    <>
      <PageHeader title="Associés" subtitle="Argent avancé par chaque associé, remboursements et parts distribuées.">
        <button className="btn-gold" onClick={() => setModal({ kind: 'distribute' })}>Distribuer des parts</button>
        <button className="btn-ghost" onClick={() => setModal({ kind: 'reimburse' })}>Rembourser un associé</button>
        <button className="btn-ghost" onClick={() => setModal('manage')}>Gérer la liste</button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input label="Situation à la date du" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        {until && <button className="btn-ghost" onClick={() => setUntil('')}>Aujourd’hui</button>}
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {S.map((g) => (
          <section key={g.id || g.name} className="card space-y-2">
            <div className="flex items-baseline justify-between"><h3 className="font-display text-base font-semibold">{g.name}</h3>{Number(g.share) > 0 && <Badge tone="amber">{g.share} %</Badge>}</div>
            <Row l="Argent avancé (apports)" v={fm(g.contributed, ref)} />
            <Row l="Déjà remboursé" v={fm(g.reimbursed, ref)} />
            <Row l="Reste à rembourser" v={fm(g.due, ref)} strong />
            <Row l="Parts reçues (distributions)" v={fm(g.distributed, ref)} strong />
            <div className="flex gap-2 pt-1">
              <button className="btn-ghost btn-sm" onClick={() => setModal({ kind: 'reimburse', partnerId: g.id })}>Rembourser</button>
              <button className="btn-ghost btn-sm" onClick={() => setModal({ kind: 'distribute', partnerId: g.id })}>Donner sa part</button>
            </div>
          </section>
        ))}
      </div>
      <Notice tone="blue">Total avancé {fm(tot.c, ref)} · remboursé {fm(tot.r, ref)} · reste à rembourser {fm(tot.due, ref)} · parts distribuées {fm(tot.d, ref)}{until ? ` (jusqu’au ${fdate(until)})` : ''}.</Notice>

      <section className="card mt-5 space-y-3">
        <h3 className="font-display text-base font-semibold">Historique des remboursements et des parts</h3>
        {!all.length ? <Empty>Aucun mouvement.</Empty> : (
          <div className="overflow-x-auto">
            <Table head={['Date', 'Associé', 'Type', 'Montant', 'Note', '']}>
              {all.map((m) => (
                <tr key={m.id} className="hover:bg-paper">
                  <td className="td whitespace-nowrap">{fdate(m.date)}</td>
                  <td className="td">{m.who}</td>
                  <td className="td text-xs">{PARTNER_MOVES[m.type]}</td>
                  <td className="td whitespace-nowrap font-medium">{fm(m.amountRef, ref)}{m.currency !== ref && <div className="text-[11px] font-normal text-neutral-500">{fm(m.amount, m.currency)}</div>}</td>
                  <td className="td text-xs">{m.note}</td>
                  <td className="td"><button className="btn-ghost btn-sm" onClick={() => cancel(m)}>Annuler</button></td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </section>

      <section className="card mt-5 space-y-3">
        <h3 className="font-display text-base font-semibold">Argent avancé : détail</h3>
        {!S.some((g) => g.contribs.length) ? <Empty>Aucun apport. Ajoutez-en depuis un paiement fournisseur ou une dépense (« ＋ Argent d’un associé »).</Empty> : (
          <div className="overflow-x-auto">
            <Table head={['Date', 'Associé', 'Pour', 'Montant']}>
              {S.flatMap((g) => g.contribs.map((c, i) => ({ ...c, k: g.name + i }))).sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((c) => (
                <tr key={c.k} className="hover:bg-paper">
                  <td className="td whitespace-nowrap">{fdate(c.date)}</td><td className="td">{c.name}</td>
                  <td className="td text-xs">{c.to ? <a className="underline" href={'#' + c.to}>{c.label}</a> : c.label}</td>
                  <td className="td whitespace-nowrap font-medium">{fm(c.amountRef, ref)}</td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </section>

      {modal === 'manage' && <ManageModal partners={partners} onClose={() => setModal(null)} />}
      {modal && modal !== 'manage' && <MoveModal {...modal} partners={partners} S={S} onClose={() => setModal(null)} />}
    </>
  )
}

const Row = ({ l, v, strong }) => <div className="flex items-baseline justify-between gap-2 text-sm"><span className="text-neutral-600">{l}</span><span className={strong ? 'font-semibold' : ''}>{v}</span></div>

function MoveModal({ kind, partnerId, partners, S, onClose }) {
  const app = useApp()
  const ref = app.ref
  const [cur, setCur] = useState(ref)
  const [rate, setRate] = useState(String(app.rate))
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [pid, setPid] = useState(partnerId || partners[0]?.id || '')
  const [total, setTotal] = useState('')
  const [lines, setLines] = useState({}) // distribution : montant par associé (modifiable)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const dist = kind === 'distribute'
  const shareSum = partners.reduce((t, p) => t + (Number(p.share) || 0), 0)
  const autoLine = (p) => (Number(total) > 0 && shareSum > 0 ? String(round2(Number(total) * (Number(p.share) || 0) / shareSum)) : '')
  const lineVal = (p) => (lines[p.id] !== undefined ? lines[p.id] : autoLine(p))
  const due = S.find((g) => g.id === pid)?.due || 0

  async function submit(e) {
    e.preventDefault()
    setErr('')
    const base = { currency: cur, rate: Number(rate), date, note: note.trim(), at: nowIso(), by: app.profile?.name || '', type: kind }
    if (!(Number(rate) > 0)) return setErr('Le taux doit être supérieur à 0.')
    const items = dist
      ? (partnerId ? [[partners.find((p) => p.id === partnerId), Number(total) || 0]] : partners.map((p) => [p, Number(lineVal(p)) || 0])).filter(([p, a]) => p && a > 0)
      : [[partners.find((p) => p.id === pid), Number(total) || 0]].filter(([p, a]) => p && a > 0)
    if (!items.length) return setErr('Entrez un montant.')
    setBusy(true)
    try {
      for (const [p, a] of items) await app.save('partnerMoves', null, { ...base, partnerId: p.id, partnerName: p.name, amount: a }, dist ? 'distribution de parts' : 'remboursement associé')
      onClose()
    } catch (ex) { setErr(ex.code === 'permission-denied' ? 'Refusé : publiez les nouvelles règles Firestore.' : ex.message); setBusy(false) }
  }
  return (
    <Modal title={dist ? 'Distribuer des parts' : 'Rembourser un associé'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {!dist && <Select label="Associé" value={pid} onChange={setPid} options={partners.map((p) => ({ value: p.id, label: p.name }))} />}
        {!dist && due > 0 && <button type="button" className="text-xs underline" onClick={() => { setCur(ref); setTotal(String(due)) }}>Reste à lui rembourser : {due} {ref} (utiliser)</button>}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <Select label="Devise" value={cur} onChange={setCur} options={['USD', 'HTG']} />
          <NumberInput label={dist && !partnerId ? 'Montant total à répartir' : 'Montant'} value={total} onChange={setTotal} />
          <NumberInput label="Taux (HTG pour 1 USD)" value={rate} onChange={setRate} />
        </div>
        {dist && !partnerId && (
          <div className="space-y-2 rounded-2xl border border-line p-3">
            <div className="text-sm font-medium">Part de chacun {shareSum > 0 ? '(selon les % de la liste, modifiable)' : '(saisissez les montants : aucun % défini dans la liste)'}</div>
            {partners.map((p) => (
              <div key={p.id} className="grid grid-cols-[1fr_120px] items-center gap-2 text-sm"><span>{p.name}{Number(p.share) > 0 ? ` · ${p.share} %` : ''}</span>
                <NumberInput value={lineVal(p)} onChange={(v) => setLines((l) => ({ ...l, [p.id]: v }))} /></div>
            ))}
          </div>
        )}
        <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        {err && <Notice tone="red">{err}</Notice>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? '…' : 'Enregistrer'}</button>
      </form>
    </Modal>
  )
}

function ManageModal({ partners, onClose }) {
  const app = useApp()
  const [list, setList] = useState(partners.map((p) => ({ ...p, share: p.share === '' || p.share == null ? '' : String(p.share) })))
  const [busy, setBusy] = useState(false)
  const upd = (i, patch) => setList(list.map((p, k) => (k === i ? { ...p, ...patch } : p)))
  async function save() {
    const clean = list.map((p) => ({ id: p.id, name: p.name.trim(), share: p.share === '' ? '' : Number(p.share) })).filter((p) => p.name)
    if (clean.some((p) => p.share !== '' && !(p.share >= 0 && p.share <= 100))) return app.notify('Une part doit être entre 0 et 100 %.', 'error')
    setBusy(true)
    try { await app.saveSettings({ partners: clean }, 'liste des associés'); onClose() } catch (ex) { app.notify(ex.message, 'error'); setBusy(false) }
  }
  return (
    <Modal title="Liste des associés" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-neutral-500">Seul l’administrateur principal voit et modifie cette liste. Le % sert à répartir automatiquement les parts (facultatif). Renommer ou retirer un associé ne supprime pas son historique.</p>
        {list.map((p, i) => (
          <div key={p.id} className="grid grid-cols-[1fr_90px_auto] items-end gap-2">
            <Input label={i === 0 ? 'Nom' : ''} value={p.name} onChange={(e) => upd(i, { name: e.target.value })} />
            <NumberInput label={i === 0 ? 'Part %' : ''} value={p.share} onChange={(v) => upd(i, { share: v })} />
            <button type="button" className="btn-ghost btn-sm !text-blush-600" onClick={() => setList(list.filter((_, k) => k !== i))} aria-label="Retirer">✕</button>
          </div>
        ))}
        <button type="button" className="btn-ghost btn-sm" onClick={() => setList([...list, { id: 'p_' + uid().slice(0, 8), name: '', share: '' }])}>＋ Ajouter un associé</button>
        <button className="btn-primary w-full" disabled={busy} onClick={save}>{busy ? '…' : 'Enregistrer'}</button>
      </div>
    </Modal>
  )
}
