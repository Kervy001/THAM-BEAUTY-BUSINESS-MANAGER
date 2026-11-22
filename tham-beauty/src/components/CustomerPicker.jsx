import { useMemo, useState } from 'react'
import { useApp } from '../lib/store.jsx'
import { customerCode } from '../lib/util.js'

// Choix d'un client par recherche (nom, prénom, téléphone ou code unique) : la liste complète n'est jamais affichée.
export default function CustomerPicker({ label = 'Client', value, onChange, placeholder = 'Client de passage', disabled }) {
  const app = useApp()
  const [q, setQ] = useState('')
  const cur = app.D.customers.find((c) => c.id === value)
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    return app.D.customers.filter((c) => `${c.name || ''} ${c.phone || ''} ${customerCode(c)}`.toLowerCase().includes(t)).slice(0, 8)
  }, [q, app.D.customers])
  return (
    <div className="block">
      {label && <span className="label">{label}</span>}
      {cur ? (
        <div className="input flex items-center justify-between gap-2">
          <span className="truncate">{cur.name} <span className="text-xs text-neutral-500">· {customerCode(cur)}</span></span>
          {!disabled && <button type="button" className="text-xs underline" onClick={() => { onChange(''); setQ('') }}>Changer</button>}
        </div>
      ) : (
        <div className="relative">
          <input className="input" placeholder={`${placeholder} — chercher (nom, prénom, tél., code)`} value={q} onChange={(e) => setQ(e.target.value)} disabled={disabled} />
          {hits.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border bg-white shadow-lg dark:bg-neutral-900">
              {hits.map((c) => (
                <button type="button" key={c.id} className="block w-full px-3 py-2 text-left text-sm hover:bg-black/5" onClick={() => { onChange(c.id); setQ('') }}>
                  {c.name} <span className="text-xs text-neutral-500">· {customerCode(c)}{c.phone ? ' · ' + c.phone : ''}</span>
                </button>
              ))}
            </div>
          )}
          {q.trim().length >= 2 && !hits.length && <div className="mt-1 text-xs text-neutral-500">Aucun client trouvé.</div>}
        </div>
      )}
    </div>
  )
}
