import { useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useApp } from './lib/store.jsx'
import Logo from './components/Logo.jsx'
import Icon from './components/Icon.jsx'
import { Toasts } from './components/ui.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import { Projects, ProjectDetail } from './pages/Projects.jsx'
import Products from './pages/Products.jsx'
import { Suppliers, Customers } from './pages/Partners.jsx'
import { Sales, SaleDetail, NewSale } from './pages/Sales.jsx'
import Expenses from './pages/Expenses.jsx'
import Stock from './pages/Stock.jsx'
import Rates from './pages/Rates.jsx'
import Reports from './pages/Reports.jsx'
import Admin from './pages/Admin.jsx'

const GROUPS = [
  { title: 'Activité', items: [
    { to: '/', label: 'Tableau de bord', icon: 'home', end: true },
    { to: '/ventes', label: 'Ventes', icon: 'receipt', perm: ['sales.write', 'sales.pay', 'finance.read'] },
    { to: '/stock', label: 'Stock', icon: 'layers', perm: ['stock.read', 'stock.write'] },
    { to: '/clients', label: 'Clients', icon: 'users', perm: ['customers.write', 'sales.write', 'finance.read'] }
  ] },
  { title: 'Approvisionnement', items: [
    { to: '/projets', label: 'Projets', icon: 'package', perm: ['projects.write', 'finance.read', 'stock.read', 'stock.write', 'payments.write', 'expenses.write'] },
    { to: '/fournisseurs', label: 'Fournisseurs', icon: 'truck', perm: ['suppliers.write', 'projects.write', 'payments.write', 'finance.read'] },
    { to: '/produits', label: 'Produits', icon: 'tag', perm: ['products.write', 'stock.read', 'sales.write', 'projects.write'] },
    { to: '/depenses', label: 'Dépenses', icon: 'wallet', perm: ['expenses.write', 'finance.read'] }
  ] },
  { title: 'Pilotage', items: [
    { to: '/taux', label: 'Taux de change', icon: 'swap', perm: ['rates.write', 'finance.read', 'sales.write'] },
    { to: '/rapports', label: 'Rapports', icon: 'chart', perm: ['finance.read', 'export'] },
    { to: '/admin', label: 'Utilisateurs & réglages', icon: 'settings', perm: ['users.manage', 'settings.manage'] }
  ] }
]

function SyncBar({ online, hasPending }) {
  if (online && !hasPending) return null
  const offline = !online
  return (
    <div className={'no-print flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium ' + (offline ? 'bg-gold-300 text-ink' : 'bg-ink text-gold-200')}>
      <Icon name={offline ? 'wifioff' : 'refresh'} size={14} className={offline ? '' : 'animate-spin'} />
      {offline
        ? `Hors ligne — vous pouvez continuer à travailler${hasPending ? ' · modifications en attente d’envoi' : ''}. Tout sera synchronisé au retour d’Internet.`
        : 'Synchronisation en cours…'}
    </div>
  )
}

export default function App() {
  const app = useApp()
  const [open, setOpen] = useState(false)
  const loc = useLocation()

  if (app.authUser === undefined || (app.authUser && app.profile === undefined)) {
    return (
      <div className="grid min-h-screen place-items-center bg-ink p-6 text-center">
        <div>
          <Logo size={112} className="mx-auto animate-pulse" />
          <div className="mt-4 text-sm text-gold-300">Chargement…</div>
          {!app.online && <div className="mt-2 max-w-xs text-xs text-neutral-400">Première connexion sur cet appareil : une connexion Internet est nécessaire.</div>}
        </div>
      </div>
    )
  }
  if (!app.authUser || !app.profile || app.profile.active === false) return <Login />
  if (!app.settings && app.profile.role !== 'admin') {
    return <div className="grid min-h-screen place-items-center p-6 text-center text-sm">Application non initialisée : l'administrateur doit se connecter en premier.</div>
  }

  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => !n.perm || n.perm.some((p) => app.can(p))) })).filter((g) => g.items.length)
  const flat = groups.flatMap((g) => g.items)
  const has = (to) => flat.find((n) => n.to === to)
  const canSell = app.can('sales.write')
  const bottom = ['/', '/stock', '/projets', '/ventes'].map(has).filter(Boolean).slice(0, canSell ? 2 : 4)
  const bottomR = ['/projets', '/ventes'].map(has).filter(Boolean).slice(0, 2)
  const bottomL = canSell ? ['/', '/stock'].map(has).filter(Boolean) : bottom

  const navLink = (n) => (
    <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
      className={({ isActive }) => 'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ' + (isActive ? 'bg-white/[0.07] text-gold-300' : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-100')}>
      {({ isActive }) => (<>
        {isActive && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-gold-200 to-gold-500" />}
        <Icon name={n.icon} size={18} />{n.label}
      </>)}
    </NavLink>
  )
  const tabLink = (n) => (
    <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => 'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ' + (isActive ? 'text-gold-300' : 'text-neutral-500')}>
      <Icon name={n.icon} size={21} />{n.label === 'Tableau de bord' ? 'Accueil' : n.label}
    </NavLink>
  )
  const initial = (app.profile.name || app.profile.email || '?').trim().charAt(0).toUpperCase()

  return (
    <div className="min-h-screen lg:flex">
      <aside className={'no-print fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-y-auto bg-ink p-4 transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ' + (open ? 'translate-x-0 shadow-pop' : '-translate-x-full')}
        style={{ backgroundImage: 'radial-gradient(120% 60% at 50% -10%, rgba(201,154,62,.22), transparent 60%)' }}>
        <div className="mb-6 flex flex-col items-center pt-2 text-center">
          <Logo size={96} className="shadow-glow" />
          <div className="mt-3 font-display text-lg font-bold tracking-wide gold-text">THAM BEAUTY</div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-blush-400">Business Manager</div>
        </div>
        <nav className="flex-1 space-y-5">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="mb-1.5 px-3 text-xs font-medium text-neutral-500">{g.title}</div>
              <div className="space-y-0.5">{g.items.map(navLink)}</div>
            </div>
          ))}
        </nav>
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white/5 p-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-b from-gold-300 to-gold-600 font-bold text-ink">{initial}</div>
          <div className="min-w-0 flex-1 text-xs">
            <div className="truncate font-semibold text-neutral-100">{app.profile.name || app.profile.email}</div>
            <div className="truncate text-neutral-500">{app.profile.role}</div>
          </div>
          <button className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-gold-300" onClick={app.logout} aria-label="Déconnexion"><Icon name="logout" size={17} /></button>
        </div>
      </aside>
      {open && <div className="no-print fixed inset-0 z-30 bg-ink/60 backdrop-blur-[2px] lg:hidden" onClick={() => setOpen(false)} />}

      <div className="min-w-0 flex-1">
        <SyncBar online={app.online} hasPending={app.hasPending} />
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-paper/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <Logo size={34} />
          <span className="font-display text-base font-bold">THAM BEAUTY</span>
          {app.hasPending && <span className="ml-auto flex items-center gap-1 rounded-full bg-gold-100 px-2.5 py-1 text-[11px] font-semibold text-gold-700"><Icon name="cloud" size={12} />en attente</span>}
        </header>
        <main key={loc.pathname} className="pop-in mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/ventes" element={<Sales />} />
            <Route path="/ventes/nouvelle" element={<NewSale />} />
            <Route path="/ventes/:id" element={<SaleDetail />} />
            <Route path="/projets" element={<Projects />} />
            <Route path="/projets/:id" element={<ProjectDetail />} />
            <Route path="/produits" element={<Products />} />
            <Route path="/stock" element={<Stock />} />
            <Route path="/clients" element={<Customers />} />
            <Route path="/fournisseurs" element={<Suppliers />} />
            <Route path="/depenses" element={<Expenses />} />
            <Route path="/taux" element={<Rates />} />
            <Route path="/rapports" element={<Reports />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>

      <nav className="no-print safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-ink/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-md items-end px-2">
          {bottomL.map(tabLink)}
          {canSell && (
            <Link to="/ventes/nouvelle" className="-mt-5 mx-2 mb-2 grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-b from-gold-200 to-gold-500 text-ink shadow-glow ring-4 ring-ink" aria-label="Nouvelle vente"><Icon name="plus" size={26} strokeWidth={2.4} /></Link>
          )}
          {canSell && bottomR.map(tabLink)}
          <button className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold text-neutral-500" onClick={() => setOpen(true)}><Icon name="menu" size={21} />Menu</button>
        </div>
      </nav>
      <Toasts items={app.toasts} />
    </div>
  )
}
