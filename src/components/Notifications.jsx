import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../lib/store.jsx'
import { askSystemNotify, systemNotifyState } from '../lib/alerts.js'
import { lowStockRows } from '../lib/stockRows.js'
import { fdt, money } from '../lib/util.js'
import Icon from './Icon.jsx'
import { Badge, Modal } from './ui.jsx'

const read = (k) => { try { return localStorage.getItem(k) || '' } catch { return '' } }
const write = (k, v) => { try { localStorage.setItem(k, v) } catch { /* stockage indisponible */ } }

// Cloche d'alertes : « nouvelle vente » (administrateurs) et « stock bas / rupture » (administrateurs et utilisateurs qui voient le stock).
export default function NotificationBell({ className = '', light = false }) {
  const app = useApp()
  const uid = app.authUser?.uid || ''
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState('') // dernière lecture des ventes, au moment de l'ouverture (pour surligner les nouveautés)
  const [lowSeen, setLowSeen] = useState(() => read(`tb-low-seen-${uid}`))
  const [perm, setPerm] = useState(systemNotifyState())
  const canStock = app.isAdmin || app.can('stock.read')
  const low = app.settings.lowStock ?? 3
  const lowRows = useMemo(() => (canStock ? lowStockRows(app.D, low) : []), [app.D, low, canStock])
  const lowSig = lowRows.map((r) => `${r.key}:${r.expected}`).join(',')
  if (!app.isAdmin && !canStock) return null
  const unread = (app.isAdmin ? app.unreadNotifs : 0) + (lowRows.length && lowSig !== lowSeen ? lowRows.length : 0)
  const show = () => {
    setSeen(read(`tb-notif-seen-${uid}`))
    setOpen(true)
    if (app.isAdmin) app.markNotifsSeen()
    write(`tb-low-seen-${uid}`, lowSig)
    setLowSeen(lowSig)
  }
  return (
    <>
      <button type="button" onClick={show} aria-label="Alertes" className={'relative ' + className}>
        <Icon name="bell" size={light ? 17 : 21} />
        {unread > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-[1rem] place-items-center rounded-full bg-blush-500 px-1 text-[9px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <Modal title="Alertes" onClose={() => setOpen(false)}>
          <div className="space-y-4">
            {app.isAdmin && perm === 'default' && (
              <div className="rounded-xl border border-gold-300 bg-gold-100/50 p-3 text-sm">
                Recevez aussi une alerte système à chaque vente (tant que l'application reste ouverte, même en arrière-plan).
                <button className="btn-gold btn-sm mt-2 w-full" onClick={async () => setPerm(await askSystemNotify())}>Activer les alertes sur cet appareil</button>
              </div>
            )}
            {app.isAdmin && perm === 'denied' && <p className="text-xs text-neutral-500">Les alertes système sont bloquées dans les réglages du navigateur ; vous recevez quand même le bandeau dans l'application.</p>}

            <section>
              <h3 className="mb-1.5 text-sm font-semibold">Stock bas / rupture {lowRows.length > 0 && <span className="font-normal text-neutral-500">({lowRows.length})</span>}</h3>
              {!lowRows.length ? <p className="text-sm text-neutral-500">Aucun article sous le seuil ({low}). 👍</p> : (
                <div className="divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line">
                  {lowRows.slice(0, 30).map((r) => (
                    <Link key={r.key} to="/stock" onClick={() => setOpen(false)} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-paper">
                      <span className="min-w-0 truncate">{r.label}</span>
                      {r.expected <= 0 ? <Badge tone="red">Rupture</Badge> : <Badge tone="amber">reste {r.expected}</Badge>}
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {app.isAdmin && (
              <section>
                <h3 className="mb-1.5 text-sm font-semibold">Ventes récentes</h3>
                {!app.notifs.length ? <p className="py-3 text-center text-sm text-neutral-500">Aucune vente enregistrée pour le moment.</p> : (
                  <div className="divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line">
                    {app.notifs.map((n) => (
                      <Link key={n.id} to={`/ventes/${n.saleId}`} onClick={() => setOpen(false)} className="flex items-start gap-3 px-3 py-2.5 text-sm hover:bg-paper">
                        <span className={'mt-1.5 h-2 w-2 shrink-0 rounded-full ' + (n.byId !== uid && (n.at || '') > seen ? 'bg-blush-500' : 'bg-transparent')} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{n.number} — {n.total != null ? money(n.total, n.currency) : ''}</span>
                          <span className="block text-xs text-neutral-500">Vendeur : <b>{n.byName || '—'}</b>{n.byId === uid ? ' (vous)' : ''}{n.customerName ? ` · ${n.customerName}` : ''}{n.itemCount ? ` · ${n.itemCount} article(s)` : ''}</span>
                          <span className="block text-[11px] text-neutral-400">{fdt(n.at)}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-[11px] text-neutral-500">Les alertes de vente arrivent en direct tant que l'application est ouverte (ou en arrière-plan sur le téléphone). Application fermée : ouvrez-la pour voir les nouvelles ventes ici.</p>
              </section>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}
