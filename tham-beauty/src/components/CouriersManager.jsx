import { useState } from 'react'
import { useApp } from '../lib/store.jsx'

// Livreurs : ajouter, renommer, supprimer (la vente garde le nom du livreur choisi à l'époque)
export default function CouriersManager() {
  const app = useApp()
  const list = app.settings.couriers || []
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const put = (next, label) => app.saveSettings({ couriers: next }, label)
  const add = (e) => { e.preventDefault(); if (!name.trim()) return; put([...list, { id: Math.random().toString(36).slice(2, 10), name: name.trim(), phone: phone.trim() }], 'livreur ajouté'); setName(''); setPhone('') }
  const rename = (c) => { const n = window.prompt('Nouveau nom du livreur', c.name); if (n && n.trim()) put(list.map((x) => (x.id === c.id ? { ...x, name: n.trim() } : x)), 'livreur renommé') }
  const del = (c) => { if (window.confirm(`Supprimer le livreur « ${c.name} » ?`)) put(list.filter((x) => x.id !== c.id), 'livreur supprimé') }
  return (
    <div className="card mb-4 space-y-2">
      <div className="font-display text-base font-semibold">Livreurs</div>
      <p className="text-sm text-neutral-600">Choisis le livreur sur chaque vente à livrer. Les frais de livraison ne comptent pas dans le chiffre d’affaires.</p>
      {list.length === 0 && <div className="text-sm text-neutral-500">Aucun livreur pour l’instant.</div>}
      {list.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-2 border-b py-1 text-sm">
          <span><b>{c.name}</b>{c.phone ? ` · ${c.phone}` : ''}</span>
          <span className="flex gap-1"><button className="btn-ghost btn-sm" onClick={() => rename(c)}>Renommer</button><button className="btn-ghost btn-sm" onClick={() => del(c)}>Supprimer</button></span>
        </div>
      ))}
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <input className="input" placeholder="Nom du livreur" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="Téléphone (option)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <button className="btn-gold">Ajouter</button>
      </form>
    </div>
  )
}

