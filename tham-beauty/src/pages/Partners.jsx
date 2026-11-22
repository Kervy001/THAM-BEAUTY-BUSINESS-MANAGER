import { useMemo, useState } from 'react'
import { useApp } from '../lib/store.jsx'
import { saleSummary, convert, purchaseSummary } from '../lib/calc.js'
import { money, fdate } from '../lib/util.js'
import { Badge, Empty, Input, Modal, PageHeader, Table, Textarea } from '../components/ui.jsx'

function PartnerPage({ kind, title, col, perm, balanceFn, balanceLabel }) {
  const app = useApp()
  const list = app.D[col]
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const canEdit = app.can(perm)
  const filtered = list.filter((x) => (x.name + (x.phone || '')).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  async function submit(e) {
    e.preventDefault()
    const { id, ...v } = edit
    await app.save(col, id, v, id ? `modification ${kind}` : `création ${kind}`)
    setEdit(null)
  }
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value })

  return (
    <>
      <PageHeader title={title}>
        {canEdit && <button className="btn-primary" onClick={() => setEdit({ name: '', phone: '', email: '', address: '', notes: '' })}>+ Ajouter</button>}
      </PageHeader>
      <input className="input mb-3" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
      {!filtered.length ? <Empty>Aucun enregistrement.</Empty> : (
        <div className="card !p-2">
          <Table head={['Nom', 'Téléphone', balanceLabel, '']}>
            {filtered.map((x) => {
              const b = balanceFn(x.id)
              return (
                <tr key={x.id}>
                  <td className="td font-medium">{x.name}<div className="text-xs font-normal text-neutral-500">{x.address}</div></td>
                  <td className="td">{x.phone || '—'}</td>
                  <td className="td">{b > 0.004 ? <Badge tone="amber">{money(b, app.ref)}</Badge> : <span className="text-neutral-400">0</span>}</td>
                  <td className="td text-right">{canEdit && <button className="btn-ghost btn-sm" onClick={() => setEdit(x)}>Modifier</button>}</td>
                </tr>
              )
            })}
          </Table>
        </div>
      )}
      {edit && (
        <Modal title={edit.id ? 'Modifier' : 'Nouveau'} onClose={() => setEdit(null)}>
          <form onSubmit={submit} className="space-y-3">
            <Input label="Nom" value={edit.name} onChange={set('name')} required />
            <Input label="Téléphone" value={edit.phone || ''} onChange={set('phone')} />
            <Input label="E-mail" type="email" value={edit.email || ''} onChange={set('email')} />
            <Input label="Adresse" value={edit.address || ''} onChange={set('address')} />
            <Textarea label="Notes" value={edit.notes || ''} onChange={set('notes')} />
            <button className="btn-primary w-full">Enregistrer</button>
          </form>
        </Modal>
      )}
    </>
  )
}

export function Customers() {
  const app = useApp()
  const bal = useMemo(() => {
    const m = {}
    app.D.sales.filter((s) => s.status !== 'annule').forEach((s) => {
      const r = saleSummary(s)
      m[s.customerId] = (m[s.customerId] || 0) + convert(r.balance, s.currency, app.ref, s.rate)
    })
    return m
  }, [app.D.sales, app.ref])
  return <PartnerPage kind="client" title="Clients" col="customers" perm="customers.write" balanceLabel="Créance" balanceFn={(id) => bal[id] || 0} />
}

export function Suppliers() {
  const app = useApp()
  const bal = useMemo(() => {
    const m = {}
    app.D.projects.forEach((p) => {
      const s = purchaseSummary(p)
      m[p.supplierId] = (m[p.supplierId] || 0) + convert(s.balance, p.currency, app.ref, p.rate)
    })
    return m
  }, [app.D.projects, app.ref])
  return <PartnerPage kind="fournisseur" title="Fournisseurs" col="suppliers" perm="suppliers.write" balanceLabel="Dette" balanceFn={(id) => bal[id] || 0} />
}
