import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { useApp } from './lib/store.jsx'
import { useTheme } from './lib/theme.js'
import NotificationBell from './components/Notifications.jsx'
import { LockScreen, PinRequired } from './components/LockScreen.jsx'
import { useAutoLock } from './lib/useAutoLock.js'
import Logo from './components/Logo.jsx'
import Icon from './components/Icon.jsx'
import { Toasts } from './components/ui.jsx'
import Login from './pages/Login.jsx'

// Chaque page est chargée à la demande (code découpé) : l'écran d'accueil s'ouvre beaucoup plus vite.
const loaders = {
  Dashboard: () => import('./pages/Dashboard.jsx'),
  Projects: () => import('./pages/Projects.jsx'),
  Products: () => import('./pages/Products.jsx'),
  Partners: () => import('./pages/Partners.jsx'),
  Sales: () => import('./pages/Sales.jsx'),
  Expenses: () => import('./pages/Expenses.jsx'),
  Stock: () => import('./pages/Stock.jsx'),
  Rates: () => import('./pages/Rates.jsx'),
  Reports: () => import('./pages/Reports.jsx'),
  Admin: () => import('./pages/Admin.jsx'),
  Trash: () => import('./pages/Trash.jsx'),
  Labels: () => import('./pages/Labels.jsx'),
  Security: () => import('./pages/Security.jsx'),
  Receivables: () => import('./pages/Receivables.jsx'),
  Cash: () => import('./pages/Cash.jsx'),
  Inventory: () => import('./pages/Inventory.jsx')
}
// La page d'accueil commence à se télécharger tout de suite, pendant que la connexion se vérifie.
setTimeout(() => { loaders.Dashboard().catch(() => {}) }, 0)
const page = (key, name = 'default') => lazy(() => loaders[key]().then((m) => ({ default: m[name] })))
const Dashboard = page('Dashboard')
const Projects = page('Projects', 'Projects')
const ProjectDetail = page('Projects', 'ProjectDetail')
const Products = page('Products')
const Suppliers = page('Partners', 'Suppliers')
const Customers = page('Partners', 'Customers')
const Sales = page('Sales', 'Sales')
const NewSale = page('Sales', 'NewSale')
const SaleDetail = page('Sales', 'SaleDetail')
const Expenses = page('Expenses')
const Stock = page('Stock')
const Rates = page('Rates')
const Reports = page('Reports')
const Admin = page('Admin')
const Trash = page('Trash')
const Labels = page('Labels')
const Security = page('Security')
const Receivables = page('Receivables')
const Cash = page('Cash')
const Inventory = page('Inventory')

function PageLoading() {
  return <div className="grid min-h-[40vh] place-items-center"><div className="h-7 w-7 animate-spin rounded-full border-2 border-gold-300 border-t-transparent" /></div>
}

const GROUPS = [
  { title: 'Activité', items: [
    { to: '/', label: 'Tableau de bord', icon: 'home', end: true },
    { to: '/ventes', label: 'Ventes', icon: 'receipt', perm: ['sales.write', 'sales.pay', 'finance.read'] },
    { to: '/stock', label: 'Stock', icon: 'layers', perm: ['stock.read', 'stock.write'] },
    { to: '/clients', label: 'Clients', icon: 'users', perm: ['customers.write', 'sales.write', 'finance.read'] },
    { to: '/creances', label: 'Créances', icon: 'wallet', perm: ['sales.pay', 'sales.write', 'finance.read'] },
    { to: '/caisse', label: 'Clôture de caisse', icon: 'receipt', perm: ['sales.pay', 'sales.write', 'finance.read'] }
  ] },
  { title: 'Approvisionnement', items: [
    { to: '/projets', label: 'Projets', icon: 'package', perm: ['projects.write', 'finance.read', 'stock.read', 'stock.write', 'payments.write', 'expenses.write'] },
    { to: '/fournisseurs', label: 'Fournisseurs', icon: 'truck', perm: ['suppliers.write', 'projects.write', 'payments.write', 'finance.read'] },
    { to: '/inventaire', label: 'Inventaire', icon: 'layers', perm: ['stock.write'] },
    { to: '/produits', label: 'Produits', icon: 'tag', perm: ['products.write', 'stock.read', 'sales.write', 'projects.write'] },
    { to: '/depenses', label: 'Dépenses', icon: 'wallet', perm: ['expenses.write', 'finance.read'] }
  ] },
  { title: 'Pilotage', items: [
    { to: '/taux', label: 'Taux de change', icon: 'swap', perm: ['rates.write', 'finance.read', 'sales.write'] },
    { to: '/rapports', label: 'Rapports', icon: 'chart', perm: ['finance.read', 'export'] },
    { to: '/admin', label: 'Utilisateurs & réglages', icon: 'settings', perm: ['users.manage', 'settings.manage'] },
    { to: '/securite', label: 'Sécurité (PIN)', icon: 'lock' },
    { to: '/corbeille', label: 'Corbeille', icon: 'trash', adminOnly: true }
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
  const navigate = useNavigate()
  const theme = useTheme()

  // Une fois connecté, on précharge discrètement les pages les plus utilisées : la navigation devient instantanée.
  const ready = !!app.authUser && !!app.profile && app.profile.active !== false
  const lock = useAutoLock(ready ? app.authUser.uid : null, app.settings?.security)

  // On revient toujours là où on était : si l'app a été fermée (ou rechargée par le téléphone) puis rouverte,
  // on retourne sur la dernière page ouverte (valable 12 h). Le PIN protège l'écran, il ne remet pas à zéro la navigation.
  const restored = useRef(false)
  useEffect(() => {
    if (!ready || restored.current) return
    restored.current = true
    if (loc.pathname !== '/') return
    try {
      const r = JSON.parse(localStorage.getItem('tb-last-route') || 'null')
      if (r?.p && r.p !== '/' && Date.now() - r.t < 12 * 3600 * 1000) navigate(r.p, { replace: true })
    } catch { /* rien */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])
  useEffect(() => {
    if (!ready) return
    try { localStorage.setItem('tb-last-route', JSON.stringify({ p: loc.pathname + loc.search, t: Date.now() })) } catch { /* rien */ }
  }, [ready, loc.pathname, loc.search])
  useEffect(() => {
    if (!ready) return
    const run = () => ['Sales', 'Stock', 'Projects', 'Partners'].forEach((k) => loaders[k]().catch(() => {}))
    const t = window.requestIdleCallback ? window.requestIdleCallback(run, { timeout: 4000 }) : setTimeout(run, 2500)
    return () => { window.cancelIdleCallback ? window.cancelIdleCallback(t) : clearTimeout(t) }
  }, [ready])

  if (app.authUser === undefined || (app.authUser && app.profile === undefined) || (ready && !app.settingsReady)) {
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
  if (!app.settingsExists && app.profile.role !== 'admin') {
    return <div className="grid min-h-screen place-items-center p-6 text-center text-sm">Application non initialisée : l'administrateur doit se connecter en premier.</div>
  }

  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => (n.adminOnly ? app.isAdmin : !n.perm || n.perm.some((p) => app.can(p)))) })).filter((g) => g.items.length)
  const flat = groups.flatMap((g) => g.items)
  const has = (to) => flat.find((n) => n.to === to)
  const canSell = app.can('sales.write')
  const bottom = ['/', '/stock', '/projets', '/ventes'].map(has).filter(Boolean).slice(0, canSell ? 2 : 4)
  const bottomR = ['/projets', '/ventes'].map(has).filter(Boolean).slice(0, 2)
  const bottomL = canSell ? ['/', '/stock'].map(has).filter(Boolean) : bottom

  const trashCount = app.isAdmin ? app.D.trash.projects.length + app.D.trash.sales.length + app.D.trash.items.length : 0
  const requestCount = app.isAdmin ? app.D.deleteRequests.length : 0
  const badgeOf = (to) => (to === '/ventes' ? requestCount : to === '/corbeille' ? trashCount : 0)
  const navLink = (n) => (
    <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
      className={({ isActive }) => 'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ' + (isActive ? 'bg-white/[0.07] text-gold-300' : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-100')}>
      {({ isActive }) => (<>
        {isActive && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-gold-200 to-gold-500" />}
        <Icon name={n.icon} size={18} />{n.label}
        {badgeOf(n.to) > 0 && <span className={'ml-auto grid h-5 min-w-[1.25rem] place-items-center rounded-full px-1.5 text-[10px] font-bold ' + (n.to === '/ventes' ? 'bg-blush-500 text-white' : 'bg-white/10 text-neutral-300')}>{badgeOf(n.to)}</span>}
      </>)}
    </NavLink>
  )
  const tabLink = (n) => (
    <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => 'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ' + (isActive ? 'text-gold-300' : 'text-neutral-500')}>
      <span className="relative"><Icon name={n.icon} size={21} />{badgeOf(n.to) > 0 && <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full bg-blush-500 ring-2 ring-ink" />}</span>{n.label === 'Tableau de bord' ? 'Accueil' : n.label}
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
          {lock.pinSet && <button className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-gold-300" onClick={() => window.dispatchEvent(new Event('tb-lock-now'))} aria-label="Verrouiller"><Icon name="lock" size={17} /></button>}
          <NotificationBell light className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-gold-300" />
          <button className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-gold-300" onClick={theme.toggle} aria-label={theme.dark ? 'Mode clair' : 'Mode sombre'}><Icon name={theme.dark ? 'sun' : 'moon'} size={17} /></button>
          <button className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-gold-300" onClick={app.logout} aria-label="Déconnexion"><Icon name="logout" size={17} /></button>
        </div>
      </aside>
      {open && <div className="no-print fixed inset-0 z-30 bg-ink/60 backdrop-blur-[2px] lg:hidden" onClick={() => setOpen(false)} />}

      <div className="min-w-0 flex-1">
        <SyncBar online={app.online} hasPending={app.hasPending} />
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-paper/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <button type="button" className="relative -ml-1.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-neutral-900 hover:bg-black/5 active:bg-black/10" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
            <Icon name="menu" size={23} />
            {requestCount > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-blush-500 ring-2 ring-paper" />}
          </button>
          <Logo size={34} />
          <span className="font-display text-base font-bold">THAM BEAUTY</span>
          <div className="ml-auto flex items-center gap-1">
            {app.hasPending && <span className="flex items-center gap-1 rounded-full bg-gold-100 px-2.5 py-1 text-[11px] font-semibold text-gold-700"><Icon name="cloud" size={12} />en attente</span>}
            <NotificationBell className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-neutral-700 hover:bg-black/5 active:bg-black/10" />
            <button type="button" className="-mr-1.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-neutral-700 hover:bg-black/5 active:bg-black/10" onClick={theme.toggle} aria-label={theme.dark ? 'Mode clair' : 'Mode sombre'}><Icon name={theme.dark ? 'sun' : 'moon'} size={21} /></button>
          </div>
        </header>
        <main key={loc.pathname} className="pop-in mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-8">
          <ErrorBoundary resetKey={loc.pathname}>
          <Suspense fallback={<PageLoading />}>
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
            <Route path="/etiquettes" element={<Labels />} />
            <Route path="/securite" element={<Security />} />
            <Route path="/creances" element={<Receivables />} />
            <Route path="/caisse" element={<Cash />} />
            <Route path="/inventaire" element={<Inventory />} />
            <Route path="/corbeille" element={app.isAdmin ? <Trash /> : <Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <nav className="no-print safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-ink/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-md items-end px-2">
          {bottomL.map(tabLink)}
          {canSell && (
            <Link to="/ventes/nouvelle" className="-mt-5 mx-2 mb-2 grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-b from-gold-200 to-gold-500 text-ink shadow-glow ring-4 ring-ink" aria-label="Nouvelle vente"><Icon name="plus" size={26} strokeWidth={2.4} /></Link>
          )}
          {canSell && bottomR.map(tabLink)}
        </div>
      </nav>
      <Toasts items={app.toasts} />
      {lock.locked && <LockScreen uid={app.authUser.uid} name={app.profile.name} onUnlock={lock.unlock} onLogout={app.logout} verifyPassword={app.verifyPassword} />}
      {!lock.locked && app.settings?.security?.requirePin && !lock.pinSet && <PinRequired uid={app.authUser.uid} name={app.profile.name} onLogout={app.logout} onDone={() => window.dispatchEvent(new Event('tb-security-changed'))} />}
    </div>
  )
}
