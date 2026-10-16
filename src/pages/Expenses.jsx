import { useState } from 'react'
import { arrayUnion } from 'firebase/firestore'
import { useApp } from '../lib/store.jsx'
import { convert } from '../lib/calc.js'
import { GENERAL_CATEGORIES, METHODS, money, today, fdate, nowIso, uid } from '../lib/util.js'
import { Badge, Empty, Input, Modal, NumberInput, PageHeader, Select, Table, Textarea } from '../components/ui.jsx'

export function ExpenseModal({ projectId, onClose }) {
  const app = useApp()
  const cats = projectId ? app.settings.expenseCategories : GENERAL_CATEGORIES
  const [e, setE] = useState({
    projectId: projectId || '', date: today(), category: cats[0], description: '', payee: '', amount: '', currency: 'USD',
    rate: String(app.rate), method: 'Espèces', reference: '', comment: '', global: true
  })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setE({ ...e, [k]: v })
  const converted = convert(e.amount, e.currency, app.ref, e.rate)

  async function submit(ev) {
    ev.preventDefault()
    if (!(Number(e.amount) > 0)) return
    setBusy(true)
    try {
      const number = await app.nextNumber('DEP')
      const rec = { ...e, number, amount: Number(e.amount), rate: Number(e.rate), convertedRef: converted, refCurrency: app.ref, status: 'valide', kind: e.projectId ? 'projet' : 'general', global: !!(e.projectId && e.global) }
      const id = await app.save('expenses', null, rec, 'dépense')
      if (e.projectId) {
        await app.save('projects', e.projectId, { history: arrayUnion({ at: nowIso(), by: app.profile?.name || '', text: `Dépense ${number} : ${e.category} ${e.amount} ${e.currency} (taux ${e.rate})` }) })
      }
      onClose(id)
    } finally { setBusy(false) }
  }

  return (
    <Modal title={projectId ? 'Nouvelle dépense du projet' : 'Nouvelle dépense'} onClose={() => onClose()}>
      <form onSubmit={submit} className="space-y-3">
        {!projectId && (
          <Select label="Type" value={e.projectId} onChange={(v) => setE({ ...e, projectId: v, category: v ? app.settings.expenseCategories[0] : GENERAL_CATEGORIES[0] })}
            options={[{ value: '', label: 'Dépense générale (loyer, internet…)' }, ...app.D.projects.filter((p) => p.status !== 'archive').map((p) => ({ value: p.id, label: `Projet ${p.number} — ${p.name}` }))]} />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date" type="date" value={e.date} onChange={(x) => set('date')(x.target.value)} required />
          <Select label="Catégorie" value={e.category} onChange={set('category')} options={e.projectId ? app.settings.expenseCategories : GENERAL_CATEGORIES} />
          <NumberInput label="Montant" value={e.amount} onChange={set('amount')} required />
          <Select label="Devise" value={e.currency} onChange={set('currency')} options={['USD', 'HTG']} />
        </div>
        <NumberInput label="Taux applicable (HTG pour 1 USD)" value={e.rate} onChange={set('rate')} hint={e.currency !== app.ref ? `Montant converti : ${money(converted, app.ref)}` : 'Même devise que la référence : le taux ne change pas le montant.'} />
        {e.projectId && (
          <Select label="Traitement de ce frais" value={e.global ? 'global' : 'alloc'} onChange={(v) => setE({ ...e, global: v === 'global' })}
            options={[{ value: 'global', label: 'Frais global : objectif à récupérer (pas réparti sur chaque article)' }, { value: 'alloc', label: 'Réparti sur les articles (entre dans le coût de revient)' }]} />
        )}
        <Input label="Description" value={e.description} onChange={(x) => set('description')(x.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Bénéficiaire" value={e.payee} onChange={(x) => set('payee')(x.target.value)} />
          <Select label="Moyen de paiement" value={e.method} onChange={set('method')} options={METHODS} />
        </div>
        <Input label="Référence de transaction" value={e.reference} onChange={(x) => set('reference')(x.target.value)} />
        <Textarea label="Commentaire" value={e.comment} onChange={(x) => set('comment')(x.target.value)} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? '…' : 'Enregistrer la dépense'}</button>
      </form>
    </Modal>
  )
}

export default function Expenses() {
  const app = useApp()
  const [modal, setModal] = useState(false)
  const [filter, setFilter] = useState('')
  const canEdit = app.can('expenses.write')
  const list = app.D.expenses
    .filter((x) => !filter || (filter === 'general' ? !x.projectId : x.projectId === filter))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const total = list.filter((x) => x.status !== 'annule').reduce((s, x) => s + convert(x.amount, x.currency, app.ref, x.rate), 0)
  const projName = (id) => { const p = app.D.projects.find((x) => x.id === id); return p ? `${p.number}` : 'Général' }

  async function cancel(x) {
    const reason = window.prompt('Motif de l\'annulation de cette dépense (elle ne sera pas supprimée) :')
    if (!reason) return
    await app.save('expenses', x.id, { status: 'annule', cancelReason: reason }, 'annulation dépense')
  }

  return (
    <>
      <PageHeader title="Dépenses">
        {canEdit && <button className="btn-primary" onClick={() => setModal(true)}>+ Dépense</button>}
      </PageHeader>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="input !w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Toutes</option>
          <option value="general">Dépenses générales</option>
          {app.D.projects.map((p) => <option key={p.id} value={p.id}>Projet {p.number}</option>)}
        </select>
        <span className="text-sm text-neutral-600">Total affiché : <b>{money(total, app.ref)}</b></span>
      </div>
      {!list.length ? <Empty>Aucune dépense.</Empty> : (
        <div className="card !p-2">
          <Table head={['N°', 'Date', 'Projet', 'Catégorie', 'Montant', 'Converti', '']}>
            {list.map((x) => (
              <tr key={x.id} className={x.status === 'annule' ? 'opacity-50 line-through' : ''}>
                <td className="td">{x.number}</td>
                <td className="td">{fdate(x.date)}</td>
                <td className="td">{projName(x.projectId)}</td>
                <td className="td">{x.category}{x.projectId && <> <Badge tone={x.global ? 'gold' : 'gray'}>{x.global ? 'Global' : 'Réparti'}</Badge></>}<div className="text-xs text-neutral-500">{x.description}</div></td>
                <td className="td">{money(x.amount, x.currency)}<div className="text-xs text-neutral-500">taux {x.rate}</div></td>
                <td className="td">{money(convert(x.amount, x.currency, app.ref, x.rate), app.ref)}</td>
                <td className="td">{x.status === 'annule' ? <Badge tone="red">Annulée</Badge> : canEdit && <button className="btn-ghost btn-sm" onClick={() => cancel(x)}>Annuler</button>}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
      {modal && <ExpenseModal onClose={() => setModal(false)} />}
    </>
  )
}
