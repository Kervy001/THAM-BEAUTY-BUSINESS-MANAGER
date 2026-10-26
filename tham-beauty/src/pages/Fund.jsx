import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { arrayUnion } from 'firebase/firestore'
import { useApp } from '../lib/store.jsx'
import { convert, round2, purchaseSummary } from '../lib/calc.js'
import { MOVE_TYPES, fundConfig, fundSummary, restockSuggestions } from '../lib/fund.js'
import { fdate, nowIso, today, uid } from '../lib/util.js'
import { Badge, Empty, Input, Modal, Notice, NumberInput, PageHeader, PrivacyCtx, Select, Table, Textarea, useMoney, usePrivacy } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'

export default function Fund() {
  const [hidden, toggle] = usePrivacy()
  return <PrivacyCtx.Provider value={hidden}><FundInner hidden={hidden} toggle={toggle} /></PrivacyCtx.Provider>
}

function FundInner({ hidden, toggle }) {
  const app = useApp()
  const fm = useMoney()
  const ref = app.ref
  const cfg = fundConfig(app.settings)
  const F = useMemo(() => fundSummary(app.D, app.costing, ref, cfg), [app.D, app.costing, ref, cfg.mode, cfg.profitPct, cfg.fixedAmount]) // eslint-disable-line react-hooks/exhaustive-deps
  const [modal, setModal] = useState(null) // 'reinvest' | 'withdraw' | 'deposit'
  const [mode, setMode] = useState(cfg.mode)
  const [pctDraft, setPctDraft] = useState(String(cfg.profitPct))
  const [fixedDraft, setFixedDraft] = useState(String(cfg.fixedAmount || ''))
  const [budget, setBudget] = useState('')
  const [days, setDays] = useState('30')
  const budgetNum = budget === '' ? Math.max(0, F.available) : Number(budget) || 0
  const sug = useMemo(() => restockSuggestions(app.D, app.costing, ref, budgetNum, { days: Number(days) || 30 }), [app.D, app.costing, ref, budgetNum, days])
  const moves = [...app.D.fundMoves].sort((a, b) => (b.at || '').localeCompare(a.at || ''))

  const dirty = mode !== cfg.mode || (mode === 'percent' ? Number(pctDraft) !== Number(cfg.profitPct) : (Number(fixedDraft) || 0) !== cfg.fixedAmount)
  async function saveCfg() {
    const v = Number(pctDraft), fx = Number(fixedDraft) || 0
    if (mode === 'percent' && !(v >= 0 && v <= 100)) return app.notify('Le pourcentage doit être entre 0 et 100.', 'error')
    if (mode === 'fixed' && !(fx >= 0)) return app.notify('Le montant doit être positif.', 'error')
    try { await app.saveSettings({ fund: { mode, profitPct: mode === 'percent' ? v : cfg.profitPct, fixedAmount: mode === 'fixed' ? fx : cfg.fixedAmount } }, 'réglage du fonds de réinvestissement'); app.notify('Réglage enregistré.') } catch (ex) { app.notify(ex.message, 'error') }
  }
  async function cancelMove(m) {
    const reason = window.prompt('Motif de l’annulation (le mouvement reste visible, barré) :')
    if (!reason) return
    try {
      await app.save('fundMoves', m.id, { status: 'annule', cancelReason: reason }, 'mouvement du fonds annulé')
      if (m.type === 'reinvest' && m.projectId) {
        const p = app.D.projects.find((x) => x.id === m.projectId)
        if (p) await app.save('projects', p.id, { supplierPayments: (p.supplierPayments || []).map((x) => (x.fundMoveId === m.id ? { ...x, status: 'annule', cancelReason: `Fonds : ${reason}` } : x)), history: arrayUnion({ at: nowIso(), by: app.profile?.name || '', text: `Paiement financé par le fonds annulé : ${reason}` }) }, 'annulation paiement fournisseur')
      }
    } catch (ex) { app.notify(ex.message, 'error') }
  }

  return (
    <>
      <PageHeader title="Réinvestissement" subtitle="L’argent reçu des ventes, mis de côté pour racheter du stock. Les calculs des projets ne changent jamais.">
        <button className="btn-gold" onClick={() => setModal('reinvest')}>Réinvestir dans un projet</button>
        <button className="btn-ghost" onClick={() => setModal('withdraw')}>Retrait</button>
        <button className="btn-ghost" onClick={() => setModal('deposit')}>Dépôt</button>
      </PageHeader>

      <div className="relative mb-5 overflow-hidden rounded-3xl bg-ink p-5 text-white shadow-pop sm:p-7"
        style={{ backgroundImage: 'radial-gradient(80% 120% at 100% 0%, rgba(201,154,62,.32), transparent 55%), radial-gradient(60% 100% at 0% 100%, rgba(240,86,143,.16), transparent 60%)' }}>
        <button type="button" onClick={toggle} className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full text-gold-300 hover:bg-white/10" aria-label={hidden ? 'Afficher les montants' : 'Masquer les montants'}><Icon name={hidden ? 'eyeoff' : 'eye'} size={21} /></button>
        <div className="text-sm font-medium text-gold-300">Fonds disponible pour réinvestir</div>
        <div className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl"><span className="gold-text">{fm(F.available, ref)}</span></div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[['Alimenté par les ventes', F.allocated], ['Dépôts', F.deposits], ['Réinvesti', F.reinvested], ['Retraits', F.withdrawn]].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10"><div className="text-xs text-neutral-400">{l}</div><div className="mt-1 text-lg font-semibold">{fm(v, ref)}</div></div>
          ))}
        </div>
      </div>

      <section className="card mb-5 space-y-3">
        <h3 className="font-display text-base font-semibold">Comment le fonds se remplit</h3>
        <p className="text-sm text-neutral-600">Pour chaque vente <b>encaissée</b> : le <b>coût de revient</b> des articles vendus (votre capital qui revient) + une <b>part du bénéfice</b> que vous décidez, au prorata de ce qui a été payé. Le reste du bénéfice est à vous.</p>
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-paper p-1 sm:max-w-md">
          {[['percent', 'Pourcentage du bénéfice'], ['fixed', 'Montant fixe']].map(([k, l]) => (
            <button key={k} type="button" className={'rounded-xl px-3 py-2 text-sm font-semibold ' + (mode === k ? 'bg-ink text-gold-300' : 'text-neutral-500')} onClick={() => setMode(k)}>{l}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {mode === 'percent'
            ? <NumberInput label="% du bénéfice versé au fonds" value={pctDraft} onChange={setPctDraft} className="w-48" />
            : <NumberInput label={`Montant fixe que je mets de côté (${ref})`} value={fixedDraft} onChange={setFixedDraft} className="w-64" />}
          <button className="btn-primary" onClick={saveCfg} disabled={!dirty}>Enregistrer</button>
        </div>
        <p className="text-xs text-neutral-500">
          {mode === 'percent' ? 'Une vente non payée n’alimente pas le fonds ; une vente payée à moitié l’alimente pour moitié.'
            : `Montant total que vous décidez de verser au fonds (en plus du capital). Vous pouvez le modifier à tout moment. Il ne dépasse jamais le bénéfice déjà encaissé : ${fm(F.profitPart, ref)} pour l’instant.`}
          {' '}Actuellement la part du bénéfice dans le fonds : <b>{fm(F.profitShare, ref)}</b>.
        </p>
      </section>

      <section className="card mb-5 space-y-3">
        <div className="flex items-center gap-2"><Icon name="trend" size={16} className="text-gold-500" /><h3 className="font-display text-base font-semibold">Que racheter ?</h3></div>
        <p className="text-xs text-neutral-500">Classement par <b>bénéfice généré par jour</b> (vitesse de vente des 60 derniers jours × gain par pièce). Quantité proposée = de quoi couvrir {days || 30} jours de ventes, moins le stock restant, dans la limite du budget.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberInput label={`Budget (${ref})`} value={budget} onChange={setBudget} hint={`Vide = tout le fonds disponible (${fm(Math.max(0, F.available), ref)})`} />
          <NumberInput label="Jours de ventes à couvrir" value={days} onChange={setDays} />
        </div>
        {!sug.rows.some((r) => r.qty > 0) ? <Empty icon="package">{sug.rows.length ? 'Rien à proposer : le stock couvre déjà la période, ou le budget est trop petit.' : 'Pas assez d’historique de ventes (60 derniers jours) pour faire une suggestion.'}</Empty> : (
          <>
            <div className="overflow-x-auto">
              <Table head={['Article', 'Ventes / sem.', 'Stock', 'Marge', 'À racheter', 'Coût']}>
                {sug.rows.filter((r) => r.qty > 0).map((r) => (
                  <tr key={r.key}>
                    <td className="td font-medium">{r.label}{r.daysLeft <= 7 && <div><Badge tone="red">≈ {r.daysLeft} j de stock</Badge></div>}</td>
                    <td className="td">{r.perWeek}</td><td className="td">{r.remaining}</td>
                    <td className="td">{r.marginPct != null ? `${r.marginPct} %` : '—'}</td>
                    <td className="td font-semibold">{r.qty} pcs</td><td className="td">{fm(r.cost, ref)}</td>
                  </tr>
                ))}
              </Table>
            </div>
            <p className="text-sm">Total proposé : <b>{fm(sug.spent, ref)}</b> · reste <b>{fm(sug.left, ref)}</b>. Passez ensuite la commande dans un <Link className="underline" to="/projets">projet</Link>, puis utilisez « Réinvestir dans un projet » pour payer le fournisseur avec ce fonds.</p>
          </>
        )}
      </section>

      {Object.keys(F.perProject).length > 0 && (
        <section className="card mb-5">
          <h3 className="mb-2 font-display text-base font-semibold">Projets financés par le fonds</h3>
          <div className="divide-y divide-line/70">
            {Object.entries(F.perProject).map(([pid, v]) => { const p = app.D.projects.find((x) => x.id === pid); return (
              <Link key={pid} to={`/projets/${pid}`} className="flex justify-between py-2 text-sm hover:underline"><span>{p ? `${p.number} ${p.name || ''}` : pid}</span><b>{fm(v, ref)}</b></Link>
            ) })}
          </div>
        </section>
      )}

      <section className="card !p-2">
        <h3 className="px-3 pb-1 pt-3 font-display text-base font-semibold">Mouvements du fonds</h3>
        {!moves.length ? <Empty icon="wallet">Aucun mouvement pour l’instant.</Empty> : (
          <Table head={['Date', 'Type', 'Détail', 'Montant', '']}>
            {moves.map((m) => (
              <tr key={m.id} className={m.status === 'annule' ? 'opacity-50 line-through' : ''}>
                <td className="td">{fdate(m.date)}</td>
                <td className="td"><Badge tone={m.type === 'reinvest' ? 'amber' : m.type === 'withdraw' ? 'red' : 'green'}>{MOVE_TYPES[m.type]}</Badge></td>
                <td className="td text-xs">{m.type === 'reinvest' ? <Link className="underline" to={`/projets/${m.projectId}`}>{m.projectNumber || 'Projet'}</Link> : null} {m.note}</td>
                <td className="td">{m.type === 'withdraw' || m.type === 'reinvest' ? '−' : '+'}{fm(m.amount, m.currency)}</td>
                <td className="td">{m.status !== 'annule' && <button className="btn-ghost btn-sm" onClick={() => cancelMove(m)}>Annuler</button>}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      {modal && <MoveModal kind={modal} F={F} onClose={() => setModal(null)} />}
    </>
  )
}

function MoveModal({ kind, F, onClose }) {
  const app = useApp()
  const ref = app.ref
  const projects = app.D.projects.filter((p) => !p.noSupplier && p.status !== 'archive' && p.status !== 'termine')
  const [f, setF] = useState({ projectId: '', amount: '', date: today(), note: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const p = projects.find((x) => x.id === f.projectId)
  const sum = p ? purchaseSummary(p) : null
  const cur = kind === 'reinvest' ? (p?.currency || ref) : ref
  const amount = Number(f.amount) || 0
  const amountRef = convert(amount, cur, ref, app.rate)
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))
  const titles = { reinvest: 'Réinvestir dans un projet', withdraw: 'Retrait (bénéfice pour moi)', deposit: 'Dépôt externe dans le fonds' }

  function pickProject(id) {
    const pr = projects.find((x) => x.id === id)
    const bal = pr ? Math.max(0, purchaseSummary(pr).balance) : 0
    const cap = pr ? convert(Math.max(0, F.available), ref, pr.currency, app.rate) : 0
    setF((x) => ({ ...x, projectId: id, amount: pr ? String(round2(Math.min(bal, cap))) : '' }))
  }

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (!(amount > 0)) return setErr('Entrez un montant.')
    if (kind !== 'deposit' && amountRef > F.available + 0.005) return setErr('Le montant dépasse le fonds disponible.')
    if (kind === 'reinvest' && !p) return setErr('Choisissez un projet.')
    setBusy(true)
    try {
      const base = { type: kind, amount, currency: cur, rate: Number(app.rate), date: f.date, note: f.note.trim(), at: nowIso(), by: app.profile?.name || '' }
      if (kind !== 'reinvest') { await app.save('fundMoves', null, base, kind === 'withdraw' ? 'retrait du fonds' : 'dépôt dans le fonds'); return onClose() }
      const mid = await app.save('fundMoves', null, { ...base, projectId: p.id, projectNumber: p.number }, 'réinvestissement')
      try {
        // Paiement fournisseur marqué « fonds » : les calculs du projet (coûts, bénéfices) ne changent pas.
        const pm = { id: uid(), type: 'payment', date: f.date, amount, currency: p.currency, rate: Number(app.rate), method: 'Fonds de réinvestissement', reference: '', note: f.note.trim(), status: 'valide', fundMoveId: mid, by: app.profile?.name || '', at: nowIso() }
        await app.save('projects', p.id, { supplierPayments: arrayUnion(pm), history: arrayUnion({ at: nowIso(), by: app.profile?.name || '', text: `Paiement fournisseur ${amount} ${p.currency} financé par le fonds de réinvestissement` }) }, 'paiement fournisseur')
      } catch (ex) {
        await app.save('fundMoves', mid, { status: 'annule', cancelReason: 'échec du paiement' }).catch(() => {})
        throw ex
      }
      onClose()
    } catch (ex) { setErr(ex.code === 'permission-denied' ? 'Refusé : publiez les nouvelles règles Firestore.' : ex.message); setBusy(false) }
  }

  return (
    <Modal title={titles[kind]} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Notice tone="blue">Fonds disponible : <b>{round2(F.available)} {ref}</b></Notice>
        {kind === 'reinvest' && (
          <>
            <Select label="Projet à financer" value={f.projectId} onChange={pickProject} placeholder="Choisir un projet…" options={projects.map((x) => ({ value: x.id, label: `${x.number} — ${x.name || ''} (reste ${round2(purchaseSummary(x).balance)} ${x.currency})` }))} />
            {sum && <p className="text-xs text-neutral-500">Dû au fournisseur : {round2(sum.owed)} {p.currency} · payé : {round2(sum.paid)} · solde : {round2(sum.balance)}. Les coûts et bénéfices du projet ne changent pas.</p>}
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label={`Montant (${cur})`} value={f.amount} onChange={set('amount')} required />
          <Input label="Date" type="date" value={f.date} onChange={(e) => set('date')(e.target.value)} required />
        </div>
        {cur !== ref && amount > 0 && <p className="text-xs text-neutral-500">≈ {round2(amountRef)} {ref} (taux {app.rate})</p>}
        <Textarea label="Note (facultatif)" rows={2} value={f.note} onChange={(e) => set('note')(e.target.value)} />
        {err && <Notice tone="red">{err}</Notice>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? '…' : 'Confirmer'}</button>
      </form>
    </Modal>
  )
}
