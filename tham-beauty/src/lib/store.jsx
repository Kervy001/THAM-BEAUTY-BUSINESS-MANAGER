import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import {
  collection, doc, onSnapshot, setDoc, runTransaction, serverTimestamp, query, orderBy, limit, addDoc
} from 'firebase/firestore'
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
  expenseCategories: DEFAULT_EXPENSE_CATEGORIES
}

const COLS = ['products', 'suppliers', 'customers', 'projects', 'expenses', 'sales', 'users', 'rateHistory']

export function AppProvider({ children }) {
  const [authUser, setAuthUser] = useState(undefined)
  const [profile, setProfile] = useState(undefined) // undefined = chargement, null = aucun profil
  const [settings, setSettings] = useState(null)
  const [data, setData] = useState({})
  const [audit, setAudit] = useState([])
  const [online, setOnline] = useState(navigator.onLine)

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
      (s) => setProfile(s.exists() ? { id: s.id, ...s.data() } : null),
      () => setProfile(null))
  }, [authUser])

  const active = !!profile && profile.active !== false

  // Abonnements aux données
  useEffect(() => {
    if (!active) return
    const unsubs = []
    unsubs.push(onSnapshot(doc(db, 'settings', 'main'), (s) => setSettings(s.exists() ? { ...DEFAULT_SETTINGS, ...s.data() } : null), () => {}))
    COLS.forEach((c) => {
      unsubs.push(onSnapshot(collection(db, c),
        (snap) => setData((d) => ({ ...d, [c]: snap.docs.map((x) => ({ id: x.id, ...x.data() })) })),
        () => setData((d) => ({ ...d, [c]: [] }))))
    })
    if (can(profile, 'finance.read') || profile.role === 'admin') {
      unsubs.push(onSnapshot(query(collection(db, 'audit'), orderBy('at', 'desc'), limit(200)),
        (snap) => setAudit(snap.docs.map((x) => ({ id: x.id, ...x.data() }))), () => {}))
    }
    return () => unsubs.forEach((u) => u())
  }, [active, profile?.role])

  const ref = settings?.refCurrency || 'USD'
  const rate = settings?.rate || DEFAULT_SETTINGS.rate

  const D = useMemo(() => ({
    products: data.products || [], suppliers: data.suppliers || [], customers: data.customers || [],
    projects: data.projects || [], expenses: data.expenses || [], sales: data.sales || [],
    users: data.users || [], rateHistory: (data.rateHistory || []).sort((a, b) => (b.at || '').localeCompare(a.at || ''))
  }), [data])

  // Coût de revient par projet (devise de référence)
  const costing = useMemo(() => {
    const out = {}
    D.projects.forEach((p) => {
      out[p.id] = projectCosting(p, D.expenses.filter((e) => e.projectId === p.id), ref)
    })
    return out
  }, [D.projects, D.expenses, ref])

  const logAudit = useCallback(async (action, entity, entityId, detail = '') => {
    try {
      await addDoc(collection(db, 'audit'), {
        at: nowIso(), action, entity, entityId, detail, userId: authUser?.uid || '', userName: profile?.name || profile?.email || ''
      })
    } catch { /* l'audit ne doit jamais bloquer */ }
  }, [authUser, profile])

  const save = useCallback(async (col, id, values, auditLabel) => {
    const _id = id || uid()
    const stamp = id ? { updatedAt: nowIso(), updatedBy: profile?.name || '' } : { createdAt: nowIso(), createdBy: profile?.name || '' }
    await setDoc(doc(db, col, _id), { ...values, ...stamp, _ts: serverTimestamp() }, { merge: true })
    if (auditLabel) logAudit(auditLabel, col, _id, values.name || values.number || '')
    return _id
  }, [profile, logAudit])

  const nextNumber = useCallback(async (prefix) => {
    const year = new Date().getFullYear()
    const key = `${prefix}-${year}`
    const r = doc(db, 'counters', key)
    const n = await runTransaction(db, async (tx) => {
      const s = await tx.get(r)
      const v = (s.exists() ? s.data().value : 0) + 1
      tx.set(r, { value: v })
      return v
    })
    return `${prefix}-${year}-${String(n).padStart(4, '0')}`
  }, [])

  const value = {
    authUser, profile, active, settings, setSettings, ref, rate, online,
    D, costing, audit, save, logAudit, nextNumber,
    can: (p) => can(profile, p),
    logout: () => signOut(auth)
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
