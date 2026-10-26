import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { arrayUnion } from 'firebase/firestore'
import { useApp } from '../lib/store.jsx'
import { convert, itemStock, projectStats, purchaseSummary, saleTotals, saleProfit, round2, markupPct, marginPct, pctSub, priceFromCoef, supplierDiscountAmount, unitCostAfterDiscount } from '../lib/calc.js'
import { STATUS_PROJECT, PAY_STATUS, fdate, fdt, money, nowIso, today, uid } from '../lib/util.js'
import { Badge, Empty, Input, Modal, MoneyStat, Notice, NumberInput, PageHeader, PasswordConfirm, Select, Stat, Table, Tabs, Textarea, payTone } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import PaymentModal from '../components/PaymentModal.jsx'
import { ExpenseModal } from './Expenses.jsx'

const statusTone = (s) => ({ brouillon: 'gray', confirme: 'blue', paye: 'blue', expedition: 'amber', partiel: 'amber', recu: 'green', vente: 'gold', termine: 'green', archive: 'gray' }[s] || 'gray')

export function Projects() {
  const app = useApp()
  const nav = useNavigate()
  const [modal, setModal] = useState(false)
  const [status, setStatus] = useState('')
  const canEdit = app.can('projects.write')
  const showMoney = app.can('finance.read') || canEdit

  const rows = useMemo(() => app.D.projects
    .filter((p) => !status || p.status === status)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .map((p) => ({ p, s: projectStats(p, app.D.sales, app.costing[p.id], app.ref, app.rate) })), [app.D, app.costing, app.ref, app.rate, status])

  return (
    <>
      <PageHeader title="Projets d'approvisionnement">
        {canEdit && <button className="btn-primary" onClick={() => setModal(true)}>+ Nouveau projet</button>}
      </PageHeader>
      <select className="input mb-3 !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">Tous les statuts</option>
        {Object.entries(STATUS_PROJECT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {!rows.length ? <Empty>Aucun projet. Un projet = une commande fournisseur (ex. 40 perruques, 100 parfums, un lot de vêtements…) vendue ensuite en plusieurs fois.</Empty> : (
        <div className="space-y-2">
          {rows.map(({ p, s }) => (
            <Link key={p.id} to={`/projets/${p.id}`} className="card block !p-3 hover:border-gold-500">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{p.number} — {p.name}</div>
                  <div className="text-xs text-neutral-500">{p.supplierName || 'Sans fournisseur'} · commande du {fdate(p.orderDate)}</div>
                </div>
                <Badge tone={statusTone(p.status)}>{STATUS_PROJECT[p.status]}</Badge>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-5">
                <span>Reçu : <b>{s.qtyReceived}/{s.qtyOrdered}</b></span>
                <span>Vendu : <b>{s.sold}</b></span>
                <span>Reste : <b>{s.remaining}</b></span>
                {showMoney && <span>Coût : <b>{money(s.totalCostRef, app.ref)}</b></span>}
                {showMoney && <span>Bénéf. réalisé : <b className={s.profitRef >= 0 ? 'text-emerald-700' : 'text-red-700'}>{money(s.profitRef, app.ref)}</b></span>}
              </div>
            </Link>
          ))}
        </div>
      )}
      {modal && <ProjectForm onClose={(id) => { setModal(false); if (id) nav(`/projets/${id}`) }} />}
    </>
  )
}

// Objectif « frais à récupérer » : chaque bénéfice réalisé s'ajoute ; le bénéfice net monte de −frais jusqu'à 0, puis devient positif.
function RecoveryCard({ stats, cur }) {
  const done = stats.netProfitRef >= -0.004
  const pct = Math.round(stats.recoveryPct || 0)
  return (
    <div className="card overflow-hidden !p-0">
      <div className="p-4" style={{ backgroundImage: 'radial-gradient(90% 140% at 100% 0%, rgba(201,154,62,.18), transparent 60%)' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[13px] text-neutral-500">Frais à récupérer (objectif)</div>
            <div className="mt-0.5 font-display text-2xl font-semibold tabular-nums">{money(stats.recoveredRef, cur)} <span className="text-base font-normal text-neutral-500">/ {money(stats.globalRef, cur)}</span></div>
          </div>
          <span className={'rounded-full px-2.5 py-1 text-xs font-semibold ' + (done ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-gold-100 text-gold-700 ring-1 ring-gold-300')}>{done ? '✓ Récupérés' : pct + ' %'}</span>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-neutral-100">
          <div className={'h-full rounded-full transition-all ' + (done ? 'bg-emerald-500' : 'bg-gradient-to-r from-gold-300 to-gold-500')} style={{ width: Math.max(done ? 100 : pct, 2) + '%' }} />
        </div>
        <div className="mt-3 flex items-end justify-between gap-3 text-sm">
          <span className="text-neutral-500">{done ? 'Tous les frais sont couverts.' : `Reste à récupérer : ${money(stats.globalRef - stats.recoveredRef, cur)}`}</span>
          <span className="text-right"><span className="block text-xs text-neutral-500">Bénéfice net du projet</span><b className={'text-lg tabular-nums ' + (stats.netProfitRef >= 0 ? 'text-emerald-700' : 'text-blush-600')}>{stats.netProfitRef > 0.004 ? '+' : ''}{money(stats.netProfitRef, cur)}</b></span>
        </div>
      </div>
    </div>
  )
}

const COEFS = [2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 3]

function ProjectForm({ project, onClose }) {
  const app = useApp()
  const [f, setF] = useState(project || {
    name: '', supplierId: '', supplierRef: '', orderDate: today(), expectedDate: '', currency: 'USD', rate: String(app.rate), allocMethod: 'value', supplierDiscount: '', supplierDiscountType: 'fixed', notes: ''
  })
  const set = (k) => (v) => setF({ ...f, [k]: v })
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const sup = app.D.suppliers.find((s) => s.id === f.supplierId)
      const base = { ...f, rate: Number(f.rate), supplierDiscount: Number(f.supplierDiscount) || 0, supplierDiscountType: f.supplierDiscountType || 'fixed', supplierName: sup?.name || '' }
      if (project) {
        const { id, ...v } = base
        await app.save('projects', id, { ...v, history: arrayUnion({ at: nowIso(), by: app.profile?.name || '', text: 'Projet modifié' }) }, 'modification projet')
        onClose(id)
      } else {
        const number = await app.nextNumber('PRJ')
        const id = await app.save('projects', null, {
          ...base, number, status: 'brouillon', items: [], receipts: [], supplierPayments: [],
          history: [{ at: nowIso(), by: app.profile?.name || '', text: `Projet créé (taux d'achat ${f.rate})` }]
        }, 'création projet')
        onClose(id)
      }
    } finally { setBusy(false) }
  }
  return (
    <Modal title={project ? 'Modifier le projet' : 'Nouveau projet'} onClose={() => onClose()}>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Nom du projet" value={f.name} onChange={(e) => set('name')(e.target.value)} required placeholder="Ex. 40 perruques — octobre, ou 100 parfums — novembre" />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Fournisseur principal" value={f.supplierId} onChange={set('supplierId')} placeholder="—" options={app.D.suppliers.map((s) => ({ value: s.id, label: s.name }))} />
          <Input label="Réf. commande fournisseur" value={f.supplierRef} onChange={(e) => set('supplierRef')(e.target.value)} />
          <Input label="Date de commande" type="date" value={f.orderDate} onChange={(e) => set('orderDate')(e.target.value)} />
          <Input label="Réception prévue" type="date" value={f.expectedDate || ''} onChange={(e) => set('expectedDate')(e.target.value)} />
          <Select label="Devise d'achat" value={f.currency} onChange={set('currency')} options={['USD', 'HTG']} />
          <NumberInput label="Taux d'achat (HTG/USD)" value={f.rate} onChange={set('rate')} />
          <Select label="Type de remise fournisseur" value={f.supplierDiscountType || 'fixed'} onChange={set('supplierDiscountType')} options={[{ value: 'fixed', label: `Montant fixe (${f.currency})` }, { value: 'percent', label: 'Pourcentage (%)' }]} />
          <NumberInput label={f.supplierDiscountType === 'percent' ? 'Remise fournisseur (%)' : `Remise fournisseur (${f.currency})`} value={f.supplierDiscount} onChange={set('supplierDiscount')} />
          <Select label="Répartition des frais « répartis »" value={f.allocMethod} onChange={set('allocMethod')} options={[{ value: 'value', label: "Proportionnelle à la valeur d'achat" }, { value: 'qty', label: 'Proportionnelle aux quantités' }, { value: 'manual', label: 'Manuelle' }]} />
        </div>
        <Textarea label="Notes" value={f.notes || ''} onChange={(e) => set('notes')(e.target.value)} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? '…' : 'Enregistrer'}</button>
      </form>
    </Modal>
  )
}

const TABS = ['Résumé', 'Articles', 'Réceptions', 'Achat & paiements', 'Dépenses', 'Ventes', 'Historique']

export function ProjectDetail() {
  const { id } = useParams()
  const app = useApp()
  const nav = useNavigate()
  const [tab, setTab] = useState('Résumé')
  const [modal, setModal] = useState(null)
  const [expEdit, setExpEdit] = useState(null)
  const [expDel, setExpDel] = useState(null)
  const p = app.D.projects.find((x) => x.id === id)
  if (!p) return <Empty>Projet introuvable (chargement…). <Link className="underline" to="/projets">Retour</Link></Empty>
  const canEdit = app.can('projects.write')
  const costing = app.costing[p.id]
  const stats = projectStats(p, app.D.sales, costing, app.ref, app.rate)
  const expenses = app.D.expenses.filter((e) => e.projectId === p.id)
  const hist = (text) => ({ history: arrayUnion({ at: nowIso(), by: app.profile?.name || '', text }) })
  const showMoney = app.can('finance.read') || canEdit

  async function setStatus(s) {
    await app.save('projects', p.id, { status: s, ...hist(`Statut → ${STATUS_PROJECT[s]}`) }, 'statut projet')
  }

  return (
    <>
      <div className="mb-3 text-sm"><Link to="/projets" className="text-neutral-500 underline">← Projets</Link></div>
      <PageHeader title={`${p.number} — ${p.name}`}>
        {canEdit && <button className="btn-ghost" onClick={() => setModal('edit')}>Modifier</button>}
        {app.isAdmin && p.id !== 'stock-direct' && <button className="btn-ghost !text-blush-600" onClick={() => setModal('delete')}><Icon name="trash" size={16} />Supprimer</button>}
      </PageHeader>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span>Fournisseur : <b>{p.supplierName || '—'}</b></span>
        {canEdit ? (
          <select className="input !w-auto !py-1" value={p.status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(STATUS_PROJECT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        ) : <Badge tone={statusTone(p.status)}>{STATUS_PROJECT[p.status]}</Badge>}
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'Résumé' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Quantité commandée" value={stats.qtyOrdered} />
            <Stat label="Reçue" value={stats.qtyReceived} sub={`En attente : ${Math.max(0, stats.qtyOrdered - stats.qtyReceived)}`} />
            <Stat label="Vendue" value={stats.sold} sub={`Retournée : ${stats.returned}`} />
            <Stat label="Stock restant" value={stats.remaining} />
          </div>
          {showMoney && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MoneyStat label="Coût des marchandises" v={stats.goodsRef} cur={app.ref} />
              <MoneyStat label="Frais d'approvisionnement" v={stats.expensesRef} cur={app.ref} />
              <MoneyStat label="Coût total du projet" v={stats.totalCostRef} cur={app.ref} />
              <MoneyStat label="Valeur du stock restant" v={stats.stockValueRef} cur={app.ref} />
              <MoneyStat label="Chiffre d'affaires réalisé" v={stats.revenueRef} cur={app.ref} sub={`Réductions : ${money(stats.discountRef, app.ref)}`} />
              <MoneyStat label="Coût des marchandises vendues" v={stats.cogsRef} cur={app.ref} />
              <MoneyStat label="Bénéfice réalisé" v={stats.profitRef} cur={app.ref} signed sub={pctSub(stats.revenueRef, stats.cogsRef)} />
              <MoneyStat label="Bénéfice prévisionnel (tout le lot)" v={stats.forecastProfitRef} cur={app.ref} signed sub={['Prix de vente prévus − coût total', pctSub(stats.plannedRevenueRef, stats.totalCostRef)].filter(Boolean).join(' · ')} />
            </div>
          )}
          {showMoney && stats.globalRef > 0.004 && <RecoveryCard stats={stats} cur={app.ref} />}
          {showMoney && stats.plannedRevenueRef > 0 && stats.minCoef && stats.forecastProfitRef < -0.004 && (
            <Notice tone="amber">Avec les prix de vente prévus actuels, ce lot ne couvre pas tous les frais (manque {money(-stats.forecastProfitRef, app.ref)}). Coefficient moyen minimum pour ne pas perdre : <b>× {String(round2(stats.minCoef)).replace('.', ',')}</b>.</Notice>
          )}
          <Notice tone="blue">Le bénéfice réalisé ne compte que le coût des articles réellement vendus ; le coût des articles encore en stock reste dans la valeur du stock.</Notice>
          {p.notes && <div className="card text-sm">{p.notes}</div>}
        </div>
      )}

      {tab === 'Articles' && <ItemsTab p={p} costing={costing} stats={stats} canEdit={canEdit} hist={hist} />}
      {tab === 'Réceptions' && <ReceiptsTab p={p} hist={hist} />}

      {tab === 'Achat & paiements' && <PurchaseTab p={p} hist={hist} />}

      {tab === 'Dépenses' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="text-sm">Total : <b>{money(costing?.expensesRef || 0, app.ref)}</b> · dont globaux : <b>{money(costing?.globalRef || 0, app.ref)}</b> · Répartition des frais « répartis » :{' '}
              {canEdit ? (
                <select className="input !inline-block !w-auto !py-1" value={p.allocMethod || 'value'} onChange={(e) => app.save('projects', p.id, { allocMethod: e.target.value, ...hist(`Répartition des frais → ${e.target.value}`) })}>
                  <option value="value">Valeur d'achat</option><option value="qty">Quantités</option><option value="manual">Manuelle</option>
                </select>
              ) : p.allocMethod}
            </div>
            {app.can('expenses.write') && <button className="btn-primary" onClick={() => setModal('expense')}>+ Dépense</button>}
          </div>
          {!expenses.length ? <Empty>Aucune dépense sur ce projet.</Empty> : (
            <div className="card !p-2">
              <Table head={['N°', 'Date', 'Catégorie', 'Montant', 'Converti', 'Traitement', ...(app.isAdmin ? [''] : [])]}>
                {expenses.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((e) => (
                  <tr key={e.id} className={e.status === 'annule' ? 'opacity-50 line-through' : ''}>
                    <td className="td">{e.number}</td><td className="td">{fdate(e.date)}</td><td className="td">{e.category}</td>
                    <td className="td">{money(e.amount, e.currency)} <span className="text-xs text-neutral-500">(taux {e.rate})</span></td>
                    <td className="td">{money(convert(e.amount, e.currency, app.ref, e.rate), app.ref)}</td>
                    <td className="td">{e.status === 'annule' ? '—' : app.can('expenses.write') ? (
                      <button className="btn-ghost btn-sm whitespace-nowrap" onClick={() => app.save('expenses', e.id, { global: !e.global }, 'traitement du frais').then(() => app.save('projects', p.id, hist(`Frais ${e.number} → ${e.global ? 'réparti sur les articles' : 'frais global'}`)))}>{e.global ? 'Global' : 'Réparti'} ⇄</button>
                    ) : (e.global ? 'Global' : 'Réparti')}</td>
                    {app.isAdmin && <td className="td whitespace-nowrap"><button className="btn-ghost btn-sm" onClick={() => setExpEdit(e)} aria-label="Modifier">✎</button> <button className="btn-ghost btn-sm !text-blush-600" onClick={() => setExpDel(e)} aria-label="Supprimer">🗑</button></td>}
                  </tr>
                ))}
              </Table>
            </div>
          )}
          <p className="text-xs text-neutral-500"><b>Global</b> : le frais ne change pas le coût de chaque article ; il devient un objectif à récupérer avec les bénéfices (voir Résumé). <b>Réparti</b> : le frais est ajouté au coût de revient des articles.</p>
          {(p.allocMethod === 'manual') && Math.abs(costing?.unallocatedRef || 0) > 0.005 && (
            <Notice>Répartition manuelle : {money(costing.unallocatedRef, app.ref)} de frais ne sont pas encore répartis (voir l'onglet Articles).</Notice>
          )}
        </div>
      )}

      {tab === 'Ventes' && <ProjectSales p={p} costing={costing} />}

      {tab === 'Historique' && (
        <div className="card">
          <ul className="space-y-2 text-sm">
            {[...(p.history || [])].sort((a, b) => b.at.localeCompare(a.at)).map((h, i) => (
              <li key={i} className="flex gap-3 border-b border-neutral-100 pb-2"><span className="w-36 shrink-0 text-xs text-neutral-500">{fdt(h.at)}</span><span>{h.text} <span className="text-xs text-neutral-400">— {h.by}</span></span></li>
            ))}
          </ul>
        </div>
      )}

      {modal === 'edit' && <ProjectForm project={p} onClose={() => setModal(null)} />}
      {expEdit && <ExpenseModal expense={expEdit} onClose={() => setExpEdit(null)} />}
      {expDel && (
        <PasswordConfirm title="Supprimer cette dépense ?" confirmLabel="Supprimer définitivement" askReason verify={app.verifyPassword}
          onConfirm={async (reason) => {
            await app.removeExpense(expDel, reason)
            await app.save('projects', p.id, hist(`Dépense ${expDel.number} supprimée (${expDel.category} ${expDel.amount} ${expDel.currency})${reason ? ' : ' + reason : ''}`))
          }}
          onClose={(done) => { setExpDel(null); if (done) app.notify('Dépense supprimée.') }}>
          <p><b>{expDel.number}</b> — {expDel.category} : {money(expDel.amount, expDel.currency)} sera supprimée définitivement ; le coût du projet et les bénéfices se recalculent. Pour garder une trace, utilisez plutôt « Annuler » (page Dépenses).</p>
        </PasswordConfirm>
      )}
      {modal === 'delete' && (
        <PasswordConfirm title="Supprimer ce projet ?" confirmLabel="Mettre à la corbeille" askReason verify={app.verifyPassword}
          onConfirm={(reason) => app.trashProject(p, reason)}
          onClose={(done) => { setModal(null); if (done) { app.notify('Projet déplacé dans la corbeille (30 jours avant suppression définitive).'); nav('/projets', { replace: true }) } }}>
          <p><b>{p.number} — {p.name}</b> sera déplacé dans la <b>corbeille</b> et supprimé définitivement après 30 jours. Vous pourrez le restaurer d'ici là.</p>
          {(() => {
            const nSales = app.D.sales.filter((x) => (x.lines || []).length > 0 && x.lines.every((l) => l.projectId === p.id)).length
            return (nSales > 0 || expenses.length > 0) ? <p className="mt-2 rounded-xl bg-gold-100/60 p-2.5 text-xs">Seront aussi retirés des chiffres et des stocks : <b>{nSales}</b> vente(s) liée(s) à ce projet et <b>{expenses.length}</b> dépense(s).</p> : null
          })()}
        </PasswordConfirm>
      )}
      {modal === 'expense' && <ExpenseModal projectId={p.id} onClose={() => setModal(null)} />}
    </>
  )
}

function ItemsTab({ p, costing, stats, canEdit, hist }) {
  const app = useApp()
  const [edit, setEdit] = useState(null)
  const items = p.items || []
  const showMoney = app.can('finance.read') || canEdit

  async function saveItem(e) {
    e.preventDefault()
    const it = { ...edit, qtyOrdered: Number(edit.qtyOrdered), unitCost: Number(edit.unitCost), plannedPrice: Number(edit.plannedPrice) || 0, coefficient: Number(edit.coefficient) || 0, manualShare: Number(edit.manualShare) || 0, qtyReceived: Number(edit.qtyReceived) || 0, qtyLost: Number(edit.qtyLost) || 0 }
    if (!(it.qtyOrdered > 0)) return alert('Quantité commandée requise.')
    if (!it.label) return alert('Choisissez un produit ou saisissez un libellé.')
    const exists = items.some((x) => x.id === it.id)
    const next = exists ? items.map((x) => (x.id === it.id ? it : x)) : [...items, it]
    await app.save('projects', p.id, { items: next, ...hist(`${exists ? 'Article modifié' : 'Article ajouté'} : ${it.label} × ${it.qtyOrdered} à ${it.unitCost} ${p.currency}`) })
    setEdit(null)
  }
  // Coefficient : le prix de vente prévu se recalcule tout seul (on peut toujours le modifier à la main)
  const recalc = (patch) => {
    const e = { ...edit, ...patch }
    if (Number(e.coefficient) > 0 && Number(e.unitCost) > 0) e.plannedPrice = priceFromCoef(p, e.unitCost, e.coefficient, e.plannedCurrency || 'USD')
    setEdit(e)
  }
  const [trashIt, setTrashIt] = useState(null)
  async function removeItem(it) {
    if (app.isAdmin) { setTrashIt(it); return } // administrateur : corbeille 30 jours + code
    const st = itemStock(it, app.D.sales)
    if (st.received > 0 || st.sold > 0) return alert('Impossible : cet article a déjà été reçu ou vendu.')
    if (!window.confirm(`Retirer « ${it.label} » du projet ?`)) return
    await app.save('projects', p.id, { items: items.filter((x) => x.id !== it.id), ...hist(`Article retiré : ${it.label}`) })
  }

  const prodOptions = []
  app.D.products.filter((x) => x.active !== false).forEach((pr) => {
    if (pr.variants?.length) pr.variants.forEach((v) => prodOptions.push({ value: `${pr.id}|${v.id}`, label: `${pr.name} — ${v.label}` }))
    else prodOptions.push({ value: `${pr.id}|`, label: pr.name })
  })
  function pick(val) {
    const [pid, vid] = val.split('|')
    const pr = app.D.products.find((x) => x.id === pid)
    const v = pr?.variants?.find((x) => x.id === vid)
    setEdit({ ...edit, productId: pid, variantId: vid || '', label: pr ? (v ? `${pr.name} — ${v.label}` : pr.name) : '', sku: v?.sku || pr?.sku || '', plannedPrice: v?.price || edit.plannedPrice, plannedCurrency: v?.priceCurrency || edit.plannedCurrency })
  }

  return (
    <div className="space-y-3">
      {canEdit && <div className="flex justify-end"><button className="btn-primary" onClick={() => setEdit({ id: uid(), productId: '', variantId: '', label: '', sku: '', qtyOrdered: '', qtyReceived: 0, qtyLost: 0, unitCost: '', plannedPrice: '', plannedCurrency: 'USD', coefficient: '', manualShare: '' })}>+ Article</button></div>}
      {!items.length ? <Empty icon="package">Aucun article. Ajoutez les produits commandés avec leur prix d'achat.</Empty> : (
        <div className="card !p-2">
          <Table head={['Article', 'Cmd', 'Reçu', 'Prix achat', ...(showMoney ? ['Coût de revient', 'Prix prévu', 'Gain prévu'] : []), 'Vendu', 'Reste', '']}>
            {items.map((it) => {
              const st = itemStock(it, app.D.sales)
              const c = costing?.perItem?.[it.id]
              const planned = convert(it.plannedPrice, it.plannedCurrency || 'USD', app.ref, app.rate)
              const gain = c && planned ? planned - c.unitCostRef : null
              const markup = c && planned ? markupPct(planned, c.unitCostRef) : null // gain ÷ coût de revient
              const margin = c && planned ? marginPct(planned, c.unitCostRef) : null // gain ÷ prix de vente
              return (
                <tr key={it.id}>
                  <td className="td font-medium">{it.label}<div className="text-xs font-normal text-neutral-500">{it.sku}</div></td>
                  <td className="td">{it.qtyOrdered}</td>
                  <td className="td">{st.received}{st.lost > 0 && <div className="text-xs text-red-600">perdu {st.lost}</div>}</td>
                  <td className="td">{money(it.unitCost, p.currency)}</td>
                  {showMoney && <td className="td">{c ? money(c.unitCostRef, app.ref) : '—'}{p.allocMethod === 'manual' && <div className="text-xs text-neutral-500">frais {money(c?.share || 0, app.ref)}</div>}</td>}
                  {showMoney && <td className="td whitespace-nowrap">{it.plannedPrice ? money(it.plannedPrice, it.plannedCurrency) : '—'}{Number(it.coefficient) > 0 && <div className="text-xs text-neutral-500">× {String(it.coefficient).replace('.', ',')}</div>}</td>}
                  {showMoney && <td className="td whitespace-nowrap">{gain == null ? '—' : <span className={gain >= 0 ? 'text-emerald-700' : 'text-red-700'}>{gain > 0 ? '+' : ''}{money(gain, app.ref)}{markup != null && <b className="block">{gain > 0 ? '+' : ''}{round2(markup)} %</b>}{margin != null && <span className="block text-xs font-normal opacity-80">marge {round2(margin)} %</span>}</span>}</td>}
                  <td className="td">{st.sold}</td><td className="td font-medium">{st.remaining}</td>
                  <td className="td whitespace-nowrap">{canEdit && <><button className="btn-ghost btn-sm" onClick={() => setEdit({ ...it })}>✎</button> <button className="btn-ghost btn-sm" onClick={() => removeItem(it)}>✕</button></>}</td>
                </tr>
              )
            })}
          </Table>
        </div>
      )}
      {showMoney && <p className="text-xs text-neutral-500">Coût de revient = prix d'achat (converti au taux du projet, remise fournisseur incluse) + part des frais « répartis » (les frais « globaux » ne sont pas dans le coût de chaque article : ils forment l'objectif à récupérer, voir Résumé). Les prix prévus sont convertis au taux général actuel ({app.rate}).<br /><b>Gain prévu</b> = prix prévu − coût de revient. Le <b>%</b> en gras = gain ÷ coût de revient (combien je gagne sur ce que j'ai dépensé) ; « marge » = gain ÷ prix de vente.</p>}
      {trashIt && (
        <PasswordConfirm title="Supprimer cet article ?" confirmLabel="Mettre à la corbeille" askReason verify={app.verifyPassword}
          onConfirm={(reason) => app.trashItems([{ pid: p.id, itemId: trashIt.id }], reason)}
          onClose={(done) => { setTrashIt(null); if (done) app.notify('Article déplacé dans la corbeille (30 jours).') }}>
          <p><b>{trashIt.label}</b> sera retiré du projet et du stock, et déplacé dans la <b>corbeille</b> (restaurable 30 jours).</p>
          {(() => { const st = itemStock(trashIt, app.D.sales); return st.sold > 0 ? <p className="mt-2 rounded-xl bg-gold-100/60 p-2.5 text-xs">{st.sold} unité(s) déjà vendue(s) : les ventes restent intactes.</p> : null })()}
        </PasswordConfirm>
      )}
      {edit && (
        <Modal title={items.some((x) => x.id === edit.id) ? "Modifier l'article" : 'Ajouter un article'} onClose={() => setEdit(null)}>
          <form onSubmit={saveItem} className="space-y-3">
            <Select label="Produit / variante" value={edit.productId ? `${edit.productId}|${edit.variantId || ''}` : ''} onChange={pick} placeholder="— choisir (ou saisir un libellé libre ci-dessous) —" options={prodOptions} />
            <Input label="Libellé" value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} required />
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="Quantité commandée" value={edit.qtyOrdered} onChange={(v) => setEdit({ ...edit, qtyOrdered: v })} required />
              <NumberInput label={`Prix d'achat unitaire (${p.currency})`} value={edit.unitCost} onChange={(v) => recalc({ unitCost: v })} required />
              <NumberInput label="Prix de vente prévu" value={edit.plannedPrice} onChange={(v) => setEdit({ ...edit, plannedPrice: v, coefficient: '' })} />
              <Select label="Devise du prix prévu" value={edit.plannedCurrency || 'USD'} onChange={(v) => recalc({ plannedCurrency: v })} options={['USD', 'HTG']} />
              <div className="col-span-2 rounded-2xl border border-line bg-gold-100/30 p-3">
                <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium"><span>Coefficient</span>
                  <span className="text-xs font-normal text-neutral-500">prix d'achat{supplierDiscountAmount(p) > 0 ? ' après remise' : ''} × coefficient = prix de vente</span></div>
                <div className="flex flex-wrap gap-1.5">
                  {COEFS.map((c) => <button key={c} type="button" className={(Number(edit.coefficient) === c ? 'btn-gold' : 'btn-ghost') + ' btn-sm'} onClick={() => recalc({ coefficient: c })}>× {String(c).replace('.', ',')}</button>)}
                </div>
                <div className="mt-2"><NumberInput label="Autre coefficient" value={edit.coefficient ?? ''} onChange={(v) => recalc({ coefficient: v })} /></div>
                {Number(edit.coefficient) > 0 && Number(edit.unitCost) > 0 && <div className="mt-2 text-xs text-neutral-600">{money(unitCostAfterDiscount(p, edit.unitCost), p.currency)} × {String(edit.coefficient).replace('.', ',')} → <b>{money(edit.plannedPrice, edit.plannedCurrency || 'USD')}</b></div>}
              </div>
              {p.allocMethod === 'manual' && <NumberInput label={`Part des frais (${app.ref})`} value={edit.manualShare} onChange={(v) => setEdit({ ...edit, manualShare: v })} />}
            </div>
            <button className="btn-primary w-full">Enregistrer</button>
          </form>
        </Modal>
      )}
    </div>
  )
}

function ReceiptsTab({ p, hist }) {
  const app = useApp()
  const [open, setOpen] = useState(false)
  const [qty, setQty] = useState({})
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [lost, setLost] = useState({})
  const canStock = app.can('stock.write')
  const items = p.items || []

  async function submit(e) {
    e.preventDefault()
    const lines = items.map((it) => ({ itemId: it.id, label: it.label, qty: Number(qty[it.id]) || 0, lost: Number(lost[it.id]) || 0 })).filter((l) => l.qty > 0 || l.lost > 0)
    if (!lines.length) return
    const next = items.map((it) => {
      const l = lines.find((x) => x.itemId === it.id)
      return l ? { ...it, qtyReceived: (Number(it.qtyReceived) || 0) + l.qty, qtyLost: (Number(it.qtyLost) || 0) + l.lost } : it
    })
    const ordered = next.reduce((s, i) => s + Number(i.qtyOrdered), 0)
    const received = next.reduce((s, i) => s + Number(i.qtyReceived), 0)
    const patch = {}
    if (['brouillon', 'confirme', 'paye', 'expedition', 'partiel'].includes(p.status)) patch.status = received >= ordered ? 'recu' : 'partiel'
    if (received > 0 && !p.receivedDate && received >= ordered) patch.receivedDate = date
    await app.save('projects', p.id, {
      items: next, ...patch,
      receipts: arrayUnion({ id: uid(), date, lines, note, by: app.profile?.name || '' }),
      ...hist(`Réception du ${fdate(date)} : ` + lines.map((l) => `${l.label} +${l.qty}${l.lost ? ` (perdu ${l.lost})` : ''}`).join(', '))
    }, 'réception')
    setOpen(false); setQty({}); setLost({}); setNote('')
  }

  return (
    <div className="space-y-3">
      {canStock && <div className="flex justify-end"><button className="btn-primary" onClick={() => setOpen(true)}>+ Réception</button></div>}
      <div className="card !p-2">
        <Table head={['Article', 'Commandé', 'Reçu', 'En attente']}>
          {items.map((it) => <tr key={it.id}><td className="td">{it.label}</td><td className="td">{it.qtyOrdered}</td><td className="td">{it.qtyReceived || 0}</td><td className="td">{Math.max(0, it.qtyOrdered - (it.qtyReceived || 0))}</td></tr>)}
        </Table>
      </div>
      <h3 className="font-medium">Historique des réceptions</h3>
      {!(p.receipts || []).length ? <Empty>Aucune réception enregistrée. Seuls les articles reçus entrent dans le stock.</Empty> : (
        <div className="space-y-2">{p.receipts.map((r) => (
          <div key={r.id} className="card !p-3 text-sm"><b>{fdate(r.date)}</b> — {r.lines.map((l) => `${l.label} +${l.qty}${l.lost ? ` (perdu/endommagé ${l.lost})` : ''}`).join(' · ')}{r.note && <div className="text-xs text-neutral-500">{r.note}</div>}</div>
        ))}</div>
      )}
      {open && (
        <Modal title="Enregistrer une réception" onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-3">
            <div className="flex items-end gap-2">
              <Input className="flex-1" label="Date de réception" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <button type="button" className="btn-ghost" onClick={() => setQty(Object.fromEntries(items.map((it) => [it.id, String(Math.max(0, it.qtyOrdered - (it.qtyReceived || 0)))])))}>Tout reçu</button>
            </div>
            {items.map((it) => (
              <div key={it.id} className="rounded-lg bg-neutral-50 p-2">
                <div className="mb-1 text-sm font-medium">{it.label} <span className="text-xs font-normal text-neutral-500">(attendu : {Math.max(0, it.qtyOrdered - (it.qtyReceived || 0))})</span></div>
                <div className="grid grid-cols-2 gap-2">
                  <NumberInput label="Quantité reçue" value={qty[it.id] ?? ''} onChange={(v) => setQty({ ...qty, [it.id]: v })} />
                  <NumberInput label="Dont endommagés / perdus" value={lost[it.id] ?? ''} onChange={(v) => setLost({ ...lost, [it.id]: v })} />
                </div>
              </div>
            ))}
            <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
            <p className="text-xs text-neutral-500">Les articles « perdus/endommagés » sont déduits du stock disponible mais gardent leur coût dans le projet.</p>
            <button className="btn-primary w-full">Valider la réception</button>
          </form>
        </Modal>
      )}
    </div>
  )
}

function PurchaseTab({ p, hist }) {
  const app = useApp()
  const [pay, setPay] = useState(false)
  const [payEdit, setPayEdit] = useState(null)
  const [payDel, setPayDel] = useState(null)
  const s = purchaseSummary(p)
  if (p.noSupplier) return <Empty icon="truck">Ce projet regroupe le stock ajouté directement (sans fournisseur) : aucun achat ni paiement fournisseur à suivre.</Empty>
  const canPay = app.can('payments.write')
  async function addPayment(pm) {
    await app.save('projects', p.id, { supplierPayments: arrayUnion(pm), ...hist(`Paiement fournisseur ${pm.amount} ${pm.currency} (taux ${pm.rate})`) }, 'paiement fournisseur')
  }
  async function editPayment(pm) {
    await app.save('projects', p.id, { supplierPayments: p.supplierPayments.map((x) => (x.id === pm.id ? pm : x)), ...hist(`Paiement fournisseur modifié : ${pm.amount} ${pm.currency} (taux ${pm.rate})`) }, 'modification paiement fournisseur')
  }
  async function cancel(pm) {
    const reason = window.prompt('Motif de l\'annulation (le paiement reste visible, barré) :')
    if (!reason) return
    if (pm.fundMoveId) await app.save('fundMoves', pm.fundMoveId, { status: 'annule', cancelReason: reason }, 'réinvestissement annulé') // l'argent retourne dans le fonds
    await app.save('projects', p.id, { supplierPayments: p.supplierPayments.map((x) => (x.id === pm.id ? { ...x, status: 'annule', cancelReason: reason } : x)), ...hist(`Paiement fournisseur annulé : ${reason}`) }, 'annulation paiement fournisseur')
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Montant dû au fournisseur" value={money(s.owed, p.currency)} sub={p.supplierDiscount ? `Remise : ${money(supplierDiscountAmount(p), p.currency)}${p.supplierDiscountType === 'percent' ? ` (${p.supplierDiscount} %)` : ''}` : ''} />
        <Stat label="Payé" value={money(s.paid, p.currency)} />
        <Stat label="Solde restant" value={money(s.balance, p.currency)} />
        <div className="card !p-3"><div className="text-xs text-neutral-500">Statut</div><div className="mt-1"><Badge tone={payTone(s.status)}>{PAY_STATUS[s.status]}</Badge></div><div className="mt-1 text-xs text-neutral-500">Taux d'achat : {p.rate}</div></div>
      </div>
      {canPay && <div className="flex justify-end"><button className="btn-primary" onClick={() => setPay(true)}>+ Paiement fournisseur</button></div>}
      {!(p.supplierPayments || []).length ? <Empty>Aucun paiement enregistré.</Empty> : (
        <div className="card !p-2">
          <Table head={['Date', 'Montant', 'Crédité', 'Moyen', '']}>
            {p.supplierPayments.map((x) => (
              <tr key={x.id} className={x.status === 'annule' ? 'opacity-50 line-through' : ''}>
                <td className="td">{fdate(x.date)}</td><td className="td">{money(x.amount, x.currency)}<div className="text-xs text-neutral-500">taux {x.rate}</div></td>
                <td className="td">{money(x.currency === p.currency ? x.amount : convert(x.amount, x.currency, p.currency, x.rate), p.currency)}</td>
                <td className="td">{x.fundMoveId ? <Badge tone="amber">Fonds réinvestissement</Badge> : x.method}</td>
                <td className="td"><div className="flex flex-wrap items-center gap-1">{canPay && x.status !== 'annule' && (!x.fundMoveId || app.isAdmin) && <button className="btn-ghost btn-sm" onClick={() => cancel(x)}>Annuler</button>}
                  {app.isAdmin && <>{!x.fundMoveId && <button className="btn-ghost btn-sm" onClick={() => setPayEdit(x)} aria-label="Modifier">✎</button>}<button className="btn-ghost btn-sm !text-blush-600" onClick={() => setPayDel(x)} aria-label="Supprimer">🗑</button></>}</div></td>
              </tr>
            ))}
          </Table>
        </div>
      )}
      {pay && <PaymentModal title="Paiement fournisseur" opCurrency={p.currency} opRate={p.rate} remaining={s.balance} onSave={addPayment} onClose={() => setPay(false)} />}
      {payEdit && <PaymentModal title="Modifier le paiement fournisseur" payment={payEdit} opCurrency={p.currency} opRate={p.rate} remaining={0} onSave={editPayment} onClose={() => setPayEdit(null)} />}
      {payDel && (
        <PasswordConfirm title="Supprimer ce paiement ?" confirmLabel="Supprimer définitivement" askReason verify={app.verifyPassword}
          onConfirm={async (reason) => {
            if (payDel.fundMoveId) await app.save('fundMoves', payDel.fundMoveId, { status: 'annule', cancelReason: 'paiement supprimé' }, 'réinvestissement annulé')
            await app.save('projects', p.id, { supplierPayments: p.supplierPayments.filter((x) => x.id !== payDel.id), ...hist(`Paiement fournisseur supprimé : ${payDel.amount} ${payDel.currency} du ${fdate(payDel.date)}${reason ? ' — ' + reason : ''}`) }, 'suppression paiement fournisseur')
          }}
          onClose={(done) => { setPayDel(null); if (done) app.notify('Paiement supprimé.') }}>
          <p>Le paiement de <b>{money(payDel.amount, payDel.currency)}</b> du {fdate(payDel.date)} sera supprimé définitivement et le solde fournisseur sera recalculé.</p>
        </PasswordConfirm>
      )}
    </div>
  )
}

function ProjectSales({ p, costing }) {
  const app = useApp()
  const rows = []
  app.D.sales.filter((s) => s.status !== 'annule').forEach((s) => {
    const lines = (s.lines || []).filter((l) => l.projectId === p.id)
    if (!lines.length) return
    const t = saleTotals(s)
    const net = t.lines.filter((x) => x.l.projectId === p.id).reduce((a, x) => a + x.netKept, 0)
    const pr = saleProfit(s, {}, { [p.id]: costing }, app.ref, (l) => l.projectId === p.id)
    rows.push({ s, qty: lines.reduce((a, l) => a + Number(l.qty), 0), net, pr })
  })
  if (!rows.length) return <Empty>Aucune vente liée à ce projet.</Empty>
  return (
    <div className="card !p-2">
      <Table head={['Vente', 'Date', 'Client', 'Qté', 'Net', 'Bénéfice']}>
        {rows.sort((a, b) => (b.s.date || '').localeCompare(a.s.date || '')).map(({ s, qty, net, pr }) => (
          <tr key={s.id}><td className="td"><Link className="underline" to={`/ventes/${s.id}`}>{s.number}</Link></td><td className="td">{fdate(s.date)}</td><td className="td">{s.customerName}</td><td className="td">{qty}</td><td className="td">{money(net, s.currency)}</td><td className="td">{money(pr.profit, app.ref)}</td></tr>
        ))}
      </Table>
    </div>
  )
}
