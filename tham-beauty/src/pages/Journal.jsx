import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../lib/store.jsx'
import { fdt, today } from '../lib/util.js'
import { Empty, Input, PageHeader, Select, Table } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'

const ENTITIES = { sales: 'Ventes', projects: 'Projets', expenses: 'Dépenses', products: 'Produits', customers: 'Clients', suppliers: 'Fournisseurs', settings: 'Réglages', fundMoves: 'Réinvestissement', partnerMoves: 'Associés', bundles: 'Boîtes', inventories: 'Inventaires', cashClosings: 'Caisse', users: 'Utilisateurs' }
const linkOf = (a) => (a.entity === 'sales' && a.entityId ? `/ventes/${a.entityId}` : a.entity === 'projects' && a.entityId ? `/projets/${a.entityId}` : a.entity === 'expenses' ? '/depenses' : a.entity === 'fundMoves' ? '/fonds' : a.entity === 'partnerMoves' ? '/associes' : a.entity === 'bundles' ? '/boites' : '')

// Journal des actions : qui a fait quoi, et quand (créations, modifications, annulations, suppressions).
export default function Journal() {
  const app = useApp()
  const [q, setQ] = useState('')
  const [user, setUser] = useState('')
  const [entity, setEntity] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [danger, setDanger] = useState(false)
  const rows = app.audit
  const users = useMemo(() => [...new Set(rows.map((a) => a.userName).filter(Boolean))].sort(), [rows])
  const DANGER = /supprim|annul|restaur|refus|corbeille|perte/i
  const list = rows.filter((a) => {
    const d = String(a.at || '').slice(0, 10)
    if (user && a.userName !== user) return false
    if (entity && a.entity !== entity) return false
    if (from && d < from) return false
    if (to && d > to) return false
    if (danger && !DANGER.test(a.action || '')) return false
    if (q && !`${a.action} ${a.detail} ${a.userName} ${a.entity}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })
  function exportCsv() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = ['Date;Utilisateur;Action;Type;Détail', ...list.map((a) => [fdt(a.at), a.userName, a.action, ENTITIES[a.entity] || a.entity, a.detail].map(esc).join(';'))].join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const el = document.createElement('a'); el.href = url; el.download = `journal-${today()}.csv`
    document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  return (
    <>
      <PageHeader title="Journal des actions" subtitle="Qui a créé, modifié, annulé ou supprimé quoi, et quand. Les 600 dernières actions.">
        <button className="btn-ghost" onClick={exportCsv}><Icon name="download" size={16} />Exporter (CSV)</button>
      </PageHeader>
      <div className="card mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Input label="Rechercher" value={q} onChange={(e) => setQ(e.target.value)} placeholder="numéro, nom, action…" />
        <Select label="Utilisateur" value={user} onChange={setUser} options={[{ value: '', label: 'Tous' }, ...users.map((u) => ({ value: u, label: u }))]} />
        <Select label="Type" value={entity} onChange={setEntity} options={[{ value: '', label: 'Tous' }, ...Object.entries(ENTITIES).map(([v, l]) => ({ value: v, label: l }))]} />
        <Input label="Du" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="Au" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={danger} onChange={(e) => setDanger(e.target.checked)} />Seulement suppressions, annulations, pertes</label>
      </div>
      <div className="card !p-2">
        {!list.length ? <Empty>Aucune action trouvée.</Empty> : (
          <Table head={['Date', 'Utilisateur', 'Action', 'Détail']}>
            {list.map((a) => (
              <tr key={a.id}>
                <td className="td whitespace-nowrap">{fdt(a.at)}</td>
                <td className="td">{a.userName}</td>
                <td className="td">{a.action}</td>
                <td className="td text-xs text-neutral-500">{ENTITIES[a.entity] || a.entity} {linkOf(a) ? <Link className="underline" to={linkOf(a)}>{a.detail || 'ouvrir'}</Link> : a.detail}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </>
  )
}
