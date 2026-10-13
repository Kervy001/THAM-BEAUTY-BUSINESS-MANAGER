import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { collection, doc, onSnapshot, setDoc, runTransaction, serverTimestamp, query, orderBy, limit, addDoc } from 'firebase/firestore'
import { auth, db, isConfigured } from './firebase.js'
import { can } from './perms.js'
import { projectCosting } from './calc.js'
import { uid, nowIso, DEFAULT_EXPENSE_CATEGORIES } from './util.js'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export const DEFAULT_SETTINGS = {
  rate: 135,
  refCurrency: 'USD',
  discountUsual: 5,
  discountWarn: 10,
  discountAuth: 20,
  lowStock: 3,
  company: { name: 'THAM BEAUTY', phone: '', address: 'Haïti', footer: 'Merci pour votre confiance !' },
  receipt: { showLogo: true, logoWidth: 90, format: 'a4' },
  logo: '',
  expenseCategories: DEFAULT_EXPENSE_CATEGORIES
}
const mergeSettings = (d) => ({
  ...DEFAULT_SETTINGS, ...d,
  company: { ...DEFAULT_SETTINGS.company, ...(d?.company || {}) },
  receipt: { ...DEFAULT_SETTINGS.receipt, ...(d?.receipt || {}) }
})

const COLS = ['products', 'suppliers', 'customers', 'projects', 'expenses', 'sales', 'users', 'rateHistory']
const errText = (e) => (e?.code === 'permission-denied' ? 'permission refusée' : e?.message || 'erreur')

export function AppProvider({ children }) {
  const [authUser, setAuthUser] = useState(undefined)
  const [profile, setProfile] = useState(undefined) // undefined = chargement, null = aucun profil
  const [settings, setSettings] = useState(null)
  const [data, setData] = useState({})
  const [audit, setAudit] = useState([])
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState({})
  const [toasts, setToasts] = useState([])
  const wasPending = useRef(false)

  const notify = useCallback((msg, tone = 'ok') => {
    const id = uid()
    setToasts((t) => [...t, { id, msg, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3200)
  }, [])

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  useEffect(() => {
    if (!isConfigured) { setAuthUser(null); return }
    return onAuthStateChanged(auth, (u) => setAuthUser(u))
  }, [])

  // Profil de l'utilisateur connecté
  useEffect(() => {
    if (!authUser) { setProfile(authUser === null ? null : undefined); return }
    return onSnapshot(doc(db, 'users', authUser.uid),
      (s) => {
        if (s.exists()) setProfile({ id: s.id, ...s.data() })
        else if (s.metadata.fromCache) setProfile(undefined) // pas encore de réponse du serveur : on attend
        else setProfile(null)
      },
      () => setProfile(null))
  }, [authUser])

  const active = !!profile && profile.active !== false

  // Abonnements aux données (avec suivi des écritures en attente de synchronisation)
  useEffect(() => {
    if (!active) return
    const unsubs = []
    const track = (key, snap) => setPending((p) => (p[key] === snap.metadata.hasPendingWrites ? p : { ...p, [key]: snap.metadata.hasPendingWrites }))
    unsubs.push(onSnapshot(doc(db, 'settings', 'main'), { includeMetadataChanges: true },
      (s) => { setSettings(s.exists() ? mergeSettings(s.data()) : null); track('settings', s) }, () => {}))
    COLS.forEach((c) => {
      unsubs.push(onSnapshot(collection(db, c), { includeMetadataChanges: true },
        (snap) => {
          setData((d) => ({ ...d, [c]: snap.docs.map((x) => ({ id: x.id, ...x.data() })) }))
          track(c, snap)
        },
        () => setData((d) => ({ ...d, [c]: [] }))))
    })
    if (can(profile, 'finance.read') || profile.role === 'admin') {
      unsubs.push(onSnapshot(query(collection(db, 'audit'), orderBy('at', 'desc'), limit(200)),
        (snap) => setAudit(snap.docs.map((x) => ({ id: x.id, ...x.data() }))), () => {}))
    }
    return () => unsubs.forEach((u) => u())
  }, [active, profile?.role])

  const hasPending = Object.values(pending).some(Boolean)
  useEffect(() => {
    if (wasPending.current && !hasPending && online) notify('Données synchronisées ✓')
    wasPending.current = hasPending
  }, [hasPending, online, notify])

  const ref = settings?.refCurrency || 'USD'
  const rate = settings?.rate || DEFAULT_SETTINGS.rate

  const D = useMemo(() => ({
    products: data.products || [], suppliers: data.suppliers || [], customers: data.customers || [],
    projects: data.projects || [], expenses: data.expenses || [], sales: data.sales || [],
    users: data.users || [], rateHistory: [...(data.rateHistory || [])].sort((a, b) => (b.at || '').localeCompare(a.at || ''))
  }), [data])

  // Coût de revient par projet (devise de référence)
  const costing = useMemo(() => {
    const out = {}
    D.projects.forEach((p) => {
      out[p.id] = projectCosting(p, D.expenses.filter((e) => e.projectId === p.id), ref)
    })
    return out
  }, [D.projects, D.expenses, ref])

  // Écriture « hors ligne d'abord » : ne bloque jamais l'écran en attendant le serveur.
  // - en ligne : on attend la confirmation (erreur affichée si refus) ; si le réseau est lent (> 2,5 s), l'opération reste en file d'attente ;
  // - hors ligne : l'opération est enregistrée sur l'appareil et partira toute seule au retour d'Internet.
  const write = useCallback((p) => new Promise((resolve, reject) => {
    if (!navigator.onLine) {
      p.catch((e) => notify(`Échec de la synchronisation : ${errText(e)}`, 'error'))
      resolve('queued')
      return
    }
    let late = false
    const t = setTimeout(() => { late = true; resolve('queued') }, 2500)
    p.then(() => { clearTimeout(t); if (!late) resolve('ok') }, (e) => {
      clearTimeout(t)
      if (late) notify(`Échec de l'enregistrement : ${errText(e)}`, 'error')
      else reject(e)
    })
  }), [notify])

  const logAudit = useCallback((action, entity, entityId, detail = '') => {
    addDoc(collection(db, 'audit'), {
      at: nowIso(), action, entity, entityId, detail, userId: authUser?.uid || '', userName: profile?.name || profile?.email || ''
    }).catch(() => {})
  }, [authUser, profile])

  const save = useCallback(async (col, id, values, auditLabel) => {
    const _id = id || uid()
    const stamp = id ? { updatedAt: nowIso(), updatedBy: profile?.name || '' } : { createdAt: nowIso(), createdBy: profile?.name || '' }
    await write(setDoc(doc(db, col, _id), { ...values, ...stamp, _ts: serverTimestamp() }, { merge: true }))
    if (auditLabel) logAudit(auditLabel, col, _id, values.name || values.number || '')
    return _id
  }, [profile, logAudit, write])

  const saveSettings = useCallback(async (patch, auditLabel) => {
    await write(setDoc(doc(db, 'settings', 'main'), patch, { merge: true }))
    if (auditLabel) logAudit(auditLabel, 'settings', 'main')
  }, [write, logAudit])

  // Numéros : séquentiels en ligne ; hors ligne, numéro local unique (lettre L) pour éviter les doublons entre appareils.
  const nextNumber = useCallback(async (prefix) => {
    const year = new Date().getFullYear()
    const local = () => `${prefix}-${year}-L${Date.now().toString(36).slice(-5).toUpperCase()}`
    if (!navigator.onLine) return local()
    const key = `${prefix}-${year}`
    try {
      const n = await Promise.race([
        runTransaction(db, async (tx) => {
          const r = doc(db, 'counters', key)
          const s = await tx.get(r)
          const v = (s.exists() ? s.data().value : 0) + 1
          tx.set(r, { value: v })
          return v
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
      ])
      return `${prefix}-${year}-${String(n).padStart(4, '0')}`
    } catch { return local() }
  }, [])

  const value = {
    authUser, profile, active, settings, ref, rate, online, hasPending, toasts,
    D, costing, audit, save, saveSettings, write, notify, logAudit, nextNumber,
    can: (p) => can(profile, p),
    logout: () => signOut(auth)
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
