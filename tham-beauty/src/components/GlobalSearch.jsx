import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/store.jsx'
import { normCode } from '../lib/codes.js'
import Icon from './Icon.jsx'

// Recherche globale (Ctrl+K) : produits (nom, code-barres, SKU), ventes, clients, fournisseurs, projets.
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export default function GlobalSearch({ className = '' }) {
  const app = useApp()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const inp = useRef(null)

  useEffect(() => {
    const k = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o) } else if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  useEffect(() => { if (open) setTimeout(() => inp.current?.focus(), 30); else setQ('') }, [open])

  const res = useMemo(() => {
    const t = norm(q).trim()
    if (t.length < 2) return []
    const D = app.D
    const out = []
    const has = (...v) => v.some((x) => norm(x).includes(t))
    for (const p of D.products || []) {
      const codes = [p.sku, p.barcode, ...(p.variants || []).flatMap((v) => [v.sku, v.barcode, v.label])]
      if (has(p.name, p.brand, ...codes)) {
        const hit = (p.variants || []).find((v) => has(v.sku, v.barcode, v.label))
        out.push({ k: 'Produit', title: p.name + (hit ? ' — ' + hit.label : ''), sub: [hit?.barcode || hit?.sku || p.barcode || p.sku].filter(Boolean).join(''), to: '/stock?q=' + encodeURIComponent(q.trim()) })
      }
    }
    for (const s of D.sales || []) if (has(s.number, s.customerName)) out.push({ k: 'Vente', title: `${s.number} — ${s.customerName || 'Client'}`, sub: s.date || '', to: `/ventes/${s.id}` })
    for (const c of D.customers || []) if (has(c.name, c.phone)) out.push({ k: 'Client', title: c.name, sub: c.phone || '', to: '/clients' })
    for (const c of D.suppliers || []) if (has(c.name, c.phone)) out.push({ k: 'Fournisseur', title: c.name, sub: c.phone || '', to: '/fournisseurs' })
    for (const p of D.projects || []) if (has(p.number, p.name)) out.push({ k: 'Projet', title: `${p.number} — ${p.name}`, sub: '', to: `/projets/${p.id}` })
    return out.slice(0, 30)
  }, [q, app.D])

  const go = (to) => { setOpen(false); nav(to) }
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-label="Rechercher (Ctrl+K)" title="Rechercher (Ctrl+K)"><Icon name="search" size={20} /></button>
      {open && (
        <div className="no-print fixed inset-0 z-50 flex items-start justify-center bg-ink/60 p-3 pt-[8vh] backdrop-blur-[2px]" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-pop" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <Icon name="search" size={18} />
              <input ref={inp} className="min-w-0 flex-1 bg-transparent text-base outline-none" placeholder="Produit, code-barres, vente, client, projet…" value={q} onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && res[0]) go(res[0].to) }} />
              <button type="button" className="text-xs text-neutral-500" onClick={() => setOpen(false)}>Esc</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {norm(q).trim().length < 2 ? <p className="p-4 text-sm text-neutral-500">Tapez au moins 2 caractères. Vous pouvez aussi scanner un code-barres.</p>
                : !res.length ? <p className="p-4 text-sm text-neutral-500">Aucun résultat.</p>
                : res.map((r, i) => (
                  <button key={i} type="button" className="flex w-full items-center justify-between gap-3 border-b border-line/60 px-4 py-2.5 text-left hover:bg-blush-50" onClick={() => go(r.to)}>
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{r.title}</span>{r.sub && <span className="block truncate text-xs text-neutral-500">{r.sub}</span>}</span>
                    <span className="shrink-0 rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-semibold text-gold-700">{r.k}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
