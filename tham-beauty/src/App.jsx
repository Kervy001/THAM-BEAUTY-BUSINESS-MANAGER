import { useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useApp } from './lib/store.jsx'
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

const NAV = [
  { to: '/', label: 'Tableau de bord', icon: '▦', end: true },
  { to: '/ventes', label: 'Ventes', icon: '🧾', perm: ['sales.write', 'sales.pay', 'finance.read'] },
  { to: '/projets', label: 'Projets', icon: '📦', perm: ['projects.write', 'finance.read', 'stock.read', 'stock.write', 'payments.write', 'expenses.write'] },
  { to: '/produits', label: 'Produits', icon: '💄', perm: ['products.write', 'stock.read', 'sales.write', 'projects.write'] },
  { to: '/stock', label: 'Stock', icon: '🗃️', perm: ['stock.read', 'stock.write'] },
  { to: '/clients', label: 'Clients', icon: '👤', perm: ['customers.write', 'sales.write', 'finance.read'] },
  { to: '/fournisseurs', label: 'Fournisseurs', icon: '🏭', perm: ['suppliers.write', 'projects.write', 'payments.write', 'finance.read'] },
  { to: '/depenses', label: 'Dépenses', icon: '💸', perm: ['expenses.write', 'finance.read'] },
  { to: '/taux', label: 'Taux de change', icon: '💱', perm: ['rates.write', 'finance.read', 'sales.write'] },
  { to: '/rapports', label: 'Rapports', icon: '📊', perm: ['finance.read', 'export'] },
  { to: '/admin', label: 'Utilisateurs & réglages', icon: '⚙️', perm: ['users.manage', 'settings.manage'] }
]

export default function App() {
  const app = useApp()
  const [open, setOpen] = useState(false)
  useLocation()

  if (app.authUser === undefined || (app.authUser && app.profile === undefined)) {
    return <div className="grid min-h-screen place-items-center bg-neutral-900 text-gold-400">Chargement…</div>
  }
  if (!app.authUser || !app.profile || app.profile.active === false) return <Login />
  if (!app.settings && app.profile.role !== 'admin') {
    return <div className="grid min-h-screen place-items-center p-6 text-center text-sm">Application non initialisée : l'administrateur doit se connecter en premier.</div>
  }

  const items = NAV.filter((n) => !n.perm || n.perm.some((p) => app.can(p)))
  const link = (n) => (
    <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
      className={({ isActive }) => 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ' + (isActive ? 'bg-gold-500/20 text-gold-400' : 'text-neutral-300 hover:bg-white/10')}>
      <span className="w-5 text-center">{n.icon}</span>{n.label}
    </NavLink>
  )

  return (
    <div className="min-h-screen lg:flex">
      <aside className={'no-print fixed inset-y-0 left-0 z-40 w-64 transform bg-neutral-900 p-3 transition lg:static lg:translate-x-0 ' + (open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="mb-4 px-2 pt-2">
          <div className="font-serif text-lg font-bold leading-tight text-gold-400">THAM BEAUTY</div>
          <div className="text-[10px] uppercase tracking-widest text-rose-brand">Business Manager</div>
        </div>
        <nav className="space-y-1 overflow-y-auto">{items.map(link)}</nav>
        <div className="mt-4 border-t border-white/10 px-2 pt-3 text-xs text-neutral-400">
          <div className="truncate">{app.profile.name || app.profile.email}</div>
          <div className="mb-2">{app.profile.role}</div>
          <button className="btn-ghost btn-sm w-full" onClick={app.logout}>Déconnexion</button>
        </div>
      </aside>
      {open && <div className="no-print fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 bg-neutral-900 px-3 py-2 text-white lg:hidden">
          <button className="rounded-lg border border-white/20 px-3 py-1.5" onClick={() => setOpen(true)}>☰</button>
          <span className="font-serif font-bold text-gold-400">THAM BEAUTY</span>
          {!app.online && <span className="ml-auto rounded bg-red-600 px-2 py-0.5 text-xs">Hors ligne</span>}
        </header>
        {!app.online && <div className="no-print hidden bg-red-600 px-3 py-1 text-center text-xs text-white lg:block">Hors ligne — les opérations ne seront enregistrées qu'au retour de la connexion.</div>}
        <main className="mx-auto max-w-6xl p-3 sm:p-5">
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
    </div>
  )
}
