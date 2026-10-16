import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { onAuthStateChanged, signOut, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth'
import { collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch, where, deleteField, arrayUnion, runTransaction, serverTimestamp, query, orderBy, limit, addDoc } from 'firebase/firestore'
import { auth, db, isConfigured } from './firebase.js'
import { beep, systemNotify } from './alerts.js'
import { can } from './perms.js'
import { projectCosting } from './calc.js'
import { uid, nowIso, money, DEFAULT_EXPENSE_CATEGORIES } from './util.js'

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
  expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
  locations: [{ id: 'main', name: 'Boutique principale' }], // boutiques / dépôts (le stock par lieu n'apparaît que s'il y en a plusieurs)
  whatsappCC: '509', // indicatif pays pour les numéros WhatsApp à 8 chiffres
  security: { requirePin: false, lockMinutes: 5 }, // verrouillage : PIN obligatoire pour tous ? délai par défaut
  commission: { enabled: false, rate: 0, basis: 'ca', target: 0, visibleToSellers: false } // commissions / objectif : visibles par l'admin seulement
}
const mergeSettings = (d) => ({
  ...DEFAULT_SETTINGS, ...d,
  company: { ...DEFAULT_SETTINGS.company, ...(d?.company || {}) },
  receipt: { ...DEFAULT_SETTINGS.receipt, ...(d?.receipt || {}) },
  security: { ...DEFAULT_SETTINGS.security, ...(d?.security || {}) },
  commission: { ...DEFAULT_SETTINGS.commission, ...(d?.commission || {}) },
  locations: d?.locations?.length ? d.locations : DEFAULT_SETTINGS.locations
})

// Données essentielles chargées tout de suite ; les données secondaires (utilisateurs, historique des taux, journal)
// sont chargées juste après l'affichage de l'écran, pour que l'app s'ouvre plus vite.
const CORE = ['products', 'suppliers', 'customers', 'projects', 'expenses', 'sales']
const LATER = ['users', 'rateHistory', 'inventories']
export const TRASH_DAYS = 30
const addDaysIso = (d) => new Date(Date.now() + d * 86400000).toISOString()
const errText = (e) => (e?.code === 'permission-denied' ? 'permission refusée' : e?.message || 'erreur')

export function AppProvider({ children }) {
  const [authUser, setAuthUser] = useState(undefined)
  const [profile, setProfile] = useState(undefined) // undefined = chargement, null = aucun profil
  const [settings, setSettings] = useState(null)
  const [settingsReady, setSettingsReady] = useState(false) // true dès que les réglages ont été lus (évite les pages vides au démarrage)
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

  // Profil de l'utilisateur connecté.
  // - Gardé sur l'appareil : au retour dans l'app, on affiche tout de suite (sans écran « Chargement » interminable).
  // - Une erreur passagère (réseau coupé, jeton en renouvellement) ne déconnecte plus : on garde le profil et on réessaie.
  useEffect(() => {
    if (!authUser) { setProfile(authUser === null ? null : undefined); if (authUser === null) { setSettings(null); setSettingsReady(false) } return }
    let dead = false, tries = 0, timer, unsub
    const cacheKey = `tb-profile-${authUser.uid}`
    try { const c = JSON.parse(localStorage.getItem(cacheKey) || 'null'); if (c && c.role) setProfile(c) } catch { /* pas de cache */ }
    const start = () => {
      unsub = onSnapshot(doc(db, 'users', authUser.uid),
        (s) => {
          tries = 0
          if (s.exists()) {
            const p = { id: s.id, ...s.data() }
            setProfile(p)
            try { localStorage.setItem(cacheKey, JSON.stringify(p)) } catch { /* stockage indisponible */ }
          } else if (!s.metadata.fromCache) {
            setProfile(null)
            try { localStorage.removeItem(cacheKey) } catch { /* rien */ }
          } // sinon : pas encore de réponse du serveur, on attend
        },
        () => {
          unsub?.()
          if (dead) return
          if (tries++ < 6) timer = setTimeout(start, 1500 * tries)
          else setProfile((p) => (p === undefined ? null : p))
        })
    }
    start()
    return () => { dead = true; clearTimeout(timer); unsub?.() }
  }, [authUser])

  const active = !!profile && profile.active !== false

  // Abonnements aux données (avec suivi des écritures en attente de synchronisation)
  const loaded = useRef({})
  useEffect(() => {
    if (!active) return
    loaded.current = {}
    const unsubs = []
    const track = (key, snap) => setPending((p) => (p[key] === snap.metadata.hasPendingWrites ? p : { ...p, [key]: snap.metadata.hasPendingWrites }))
    const listen = (c) => unsubs.push(onSnapshot(collection(db, c), { includeMetadataChanges: true },
      (snap) => {
        // Changement de métadonnées seulement (ex. « envoyé au serveur ») : pas besoin de tout redessiner.
        if (loaded.current[c] && snap.docChanges().length === 0) { track(c, snap); return }
        loaded.current[c] = true
        setData((d) => ({ ...d, [c]: snap.docs.map((x) => ({ id: x.id, ...x.data() })) }))
        track(c, snap)
      },
      () => setData((d) => ({ ...d, [c]: [] }))))
    unsubs.push(onSnapshot(doc(db, 'settings', 'main'), { includeMetadataChanges: true },
      (s) => {
        if (!s.exists() && s.metadata.fromCache) return // pas encore de réponse du serveur
        setSettings(s.exists() ? mergeSettings(s.data()) : null); setSettingsReady(true); track('settings', s)
      }, () => setSettingsReady(true)))
    CORE.forEach(listen)
    const t = setTimeout(() => {
      LATER.forEach(listen)
      // Clôtures de caisse : tout le monde voit les siennes ; l'admin / la finance voient toutes
      const allClosings = profile.role === 'admin' || can(profile, 'finance.read')
      unsubs.push(onSnapshot(allClosings ? collection(db, 'cashClosings') : query(collection(db, 'cashClosings'), where('userId', '==', authUser?.uid || '')),
        (snap) => setData((d) => ({ ...d, cashClosings: snap.docs.map((x) => ({ id: x.id, ...x.data() })) })), () => setData((d) => ({ ...d, cashClosings: [] }))))
      if (can(profile, 'finance.read') || profile.role === 'admin') {
        unsubs.push(onSnapshot(query(collection(db, 'audit'), orderBy('at', 'desc'), limit(200)),
          (snap) => setAudit(snap.docs.map((x) => ({ id: x.id, ...x.data() }))), () => {}))
      }
    }, 1200)
    return () => { clearTimeout(t); unsubs.forEach((u) => u()) }
  }, [active, profile?.role])

  const locations = settings?.locations?.length ? settings.locations : DEFAULT_SETTINGS.locations
  const hasPending = Object.values(pending).some(Boolean)
  useEffect(() => {
    if (wasPending.current && !hasPending && online) notify('Données synchronisées ✓')
    wasPending.current = hasPending
  }, [hasPending, online, notify])

  const ref = settings?.refCurrency || 'USD'
  const rate = settings?.rate || DEFAULT_SETTINGS.rate

  // Les éléments mis à la corbeille sont exclus de TOUS les calculs (stock, ventes, rapports) ;
  // une vente dont tous les articles viennent d'un projet à la corbeille suit ce projet.
  const D = useMemo(() => {
    const allProjects = data.projects || []
    const allSales = data.sales || []
    const allExpenses = data.expenses || []
    const trashedP = allProjects.filter((p) => p.deletedAt)
    const tIds = new Set(trashedP.map((p) => p.id))
    const onlyInTrashedProject = (s) => (s.lines || []).length > 0 && s.lines.every((l) => tIds.has(l.projectId))
    const sales = allSales.filter((s) => !s.deletedAt && !onlyInTrashedProject(s))
    const trashedSales = allSales.filter((s) => s.deletedAt && !onlyInTrashedProject(s))
    const expenses = allExpenses.filter((e) => !tIds.has(e.projectId))
    const trashProjects = trashedP.map((p) => ({
      ...p,
      saleCount: allSales.filter((s) => (s.lines || []).length > 0 && s.lines.every((l) => l.projectId === p.id)).length,
      expenseCount: allExpenses.filter((e) => e.projectId === p.id).length
    }))
    const trashItems = allProjects.filter((p) => !p.deletedAt).flatMap((p) => (p.trashedItems || []).map((it) => ({
      ...it, pid: p.id, projectNumber: p.number, projectName: p.name,
      saleCount: allSales.filter((x) => (x.lines || []).some((l) => l.itemId === it.id)).length
    })))
    return {
      products: data.products || [], suppliers: data.suppliers || [], customers: data.customers || [],
      projects: allProjects.filter((p) => !p.deletedAt), expenses, sales,
      users: data.users || [], inventories: data.inventories || [], cashClosings: data.cashClosings || [], rateHistory: [...(data.rateHistory || [])].sort((a, b) => (b.at || '').localeCompare(a.at || '')),
      trash: { projects: trashProjects, sales: trashedSales, items: trashItems },
      deleteRequests: sales.filter((s) => s.deleteRequest?.status === 'pending')
    }
  }, [data])

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

  // ---------- Alertes « nouvelle vente » (administrateurs) ----------
  // Chaque vente enregistrée crée un document dans `notifications`. Tous les administrateurs connectés le reçoivent en direct
  // (bandeau + bip + notification système si autorisée), même si la vente a été faite par un autre administrateur.
  const [notifs, setNotifs] = useState([])
  const [seenAt, setSeenAt] = useState('')
  const seenKey = `tb-notif-seen-${authUser?.uid || ''}`
  useEffect(() => { try { setSeenAt(localStorage.getItem(seenKey) || '') } catch { setSeenAt('') } }, [seenKey])
  useEffect(() => {
    if (!active || profile?.role !== 'admin') { setNotifs([]); return }
    let first = true
    const startedMs = Date.now()
    const unsub = onSnapshot(query(collection(db, 'notifications'), orderBy('at', 'desc'), limit(60)), (snap) => {
      setNotifs(snap.docs.map((x) => ({ id: x.id, ...x.data() })))
      if (first) { first = false; return }
      snap.docChanges().forEach((ch) => {
        if (ch.type !== 'added' || ch.doc.metadata.hasPendingWrites) return
        const n = ch.doc.data()
        if (n.byId === authUser?.uid || Date.parse(n.at || '') < startedMs - 30000) return // ma propre vente, ou ancienne alerte
        const text = `Nouvelle vente ${n.number || ''} — ${n.total != null ? money(n.total, n.currency) : ''} · par ${n.byName || '—'}${n.customerName ? ' · ' + n.customerName : ''}`
        notify(text)
        beep()
        systemNotify('THAM BEAUTY — nouvelle vente', text)
      })
    }, () => {})
    return unsub
  }, [active, profile?.role, authUser?.uid])
  const markNotifsSeen = useCallback(() => {
    const t = nowIso()
    try { localStorage.setItem(seenKey, t) } catch { /* stockage indisponible */ }
    setSeenAt(t)
  }, [seenKey])
  const unreadNotifs = useMemo(() => notifs.filter((n) => n.byId !== authUser?.uid && (n.at || '') > seenAt).length, [notifs, seenAt, authUser?.uid])
  const pushSaleNotification = useCallback((sale, id, total) => {
    save('notifications', null, {
      type: 'sale', saleId: id, number: sale.number, customerName: sale.customerName || '', total: Math.round(total * 100) / 100, currency: sale.currency,
      itemCount: (sale.lines || []).reduce((t, l) => t + (Number(l.qty) || 0), 0), byId: authUser?.uid || '', byName: profile?.name || '', at: nowIso()
    }).catch(() => {})
  }, [save, authUser, profile])

  // ---------- Sauvegarde / restauration (administrateur) ----------
  const BACKUP_COLS = ['products', 'suppliers', 'customers', 'projects', 'expenses', 'sales', 'rateHistory', 'inventories', 'cashClosings']
  const stripTs = ({ _ts, ...rest }) => rest
  const exportAll = useCallback(() => {
    const d = dataRef.current
    const collections = {}
    BACKUP_COLS.forEach((c) => { collections[c] = (d[c] || []).map(stripTs) })
    return { app: 'tham-beauty', version: 1, exportedAt: nowIso(), by: profile?.name || '', settings, collections }
  }, [settings, profile])
  const restoreAll = useCallback(async (json) => {
    if (json?.app !== 'tham-beauty' || !json.collections) throw new Error('Ce fichier n’est pas une sauvegarde THAM BEAUTY.')
    if (!navigator.onLine) throw new Error('Connexion Internet requise pour restaurer.')
    const ops = []
    BACKUP_COLS.forEach((c) => (json.collections[c] || []).forEach(({ id, ...rest }) => { if (id) ops.push({ ref: doc(db, c, id), data: { ...rest, _ts: serverTimestamp() } }) }))
    for (let i = 0; i < ops.length; i += 400) {
      const b = writeBatch(db)
      ops.slice(i, i + 400).forEach((o) => b.set(o.ref, o.data))
      await b.commit()
    }
    if (json.settings) await setDoc(doc(db, 'settings', 'main'), json.settings, { merge: true })
    logAudit('restauration d’une sauvegarde', 'settings', 'main', `${ops.length} éléments`)
    return ops.length
  }, [logAudit])

  // ---------- Corbeille, suppression de projets et de ventes ----------
  const isAdmin = profile?.role === 'admin'
  const dataRef = useRef(data)
  dataRef.current = data

  // Vérifie le mot de passe de l'administrateur connecté (Internet requis)
  const verifyPassword = useCallback(async (pw) => {
    if (!navigator.onLine) throw Object.assign(new Error('offline'), { code: 'app/offline' })
    const u = auth.currentUser
    if (!u?.email) throw Object.assign(new Error('no-user'), { code: 'app/no-user' })
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, pw))
  }, [])

  const trashFields = (reason) => ({ deletedAt: nowIso(), deletedBy: profile?.name || '', deleteReason: reason || '', purgeAt: addDaysIso(TRASH_DAYS) })
  const clearTrashFields = { deletedAt: deleteField(), deletedBy: deleteField(), deleteReason: deleteField(), purgeAt: deleteField() }

  const trashProject = useCallback(async (p, reason) => {
    await save('projects', p.id, trashFields(reason))
    logAudit('projet mis à la corbeille', 'projects', p.id, `${p.number || ''} ${p.name || ''}`.trim())
  }, [save, logAudit, profile])
  const restoreProject = useCallback(async (p) => {
    await save('projects', p.id, clearTrashFields)
    logAudit('projet restauré', 'projects', p.id, `${p.number || ''} ${p.name || ''}`.trim())
  }, [save, logAudit])
  // Suppression définitive d'un projet + ses dépenses + les ventes qui ne contiennent que ses articles
  const purgeProject = useCallback(async (pid, label = '') => {
    const d = dataRef.current
    const sales = (d.sales || []).filter((x) => (x.lines || []).length > 0 && x.lines.every((l) => l.projectId === pid))
    const exps = (d.expenses || []).filter((x) => x.projectId === pid)
    await write(Promise.all([...sales.map((x) => deleteDoc(doc(db, 'sales', x.id))), ...exps.map((x) => deleteDoc(doc(db, 'expenses', x.id)))]))
    await write(deleteDoc(doc(db, 'projects', pid)))
    logAudit('projet supprimé définitivement', 'projects', pid, label)
  }, [write, logAudit])

  // Ventes : un non-administrateur DEMANDE la suppression ; seul l'administrateur l'autorise (→ corbeille 30 jours).
  const requestSaleDeletion = useCallback(async (s, reason) => {
    await save('sales', s.id, { deleteRequest: { status: 'pending', by: profile?.name || '', byId: authUser?.uid || '', at: nowIso(), reason } })
    logAudit('demande de suppression de vente', 'sales', s.id, s.number)
  }, [save, logAudit, profile, authUser])
  const refuseSaleDeletion = useCallback(async (s, note) => {
    await save('sales', s.id, { deleteRequest: { ...s.deleteRequest, status: 'refused', answeredBy: profile?.name || '', answeredAt: nowIso(), answerNote: note || '' } })
    logAudit('demande de suppression refusée', 'sales', s.id, s.number)
  }, [save, logAudit, profile])
  const trashSale = useCallback(async (s, reason) => {
    await save('sales', s.id, trashFields(reason || s.deleteRequest?.reason))
    logAudit('vente mise à la corbeille', 'sales', s.id, s.number)
  }, [save, logAudit, profile])
  const restoreSale = useCallback(async (s) => {
    await save('sales', s.id, { ...clearTrashFields, deleteRequest: deleteField() })
    logAudit('vente restaurée', 'sales', s.id, s.number)
  }, [save, logAudit])
  const purgeSale = useCallback(async (id, label = '') => {
    await write(deleteDoc(doc(db, 'sales', id)))
    logAudit('vente supprimée définitivement', 'sales', id, label)
  }, [write, logAudit])

  // Articles en stock : l'article quitte `items` (donc stock, coûts et rapports) et va dans `trashedItems` du projet.
  // Les ventes déjà faites gardent leur historique (libellé, prix et coût d'origine).
  const byProject = (list) => list.reduce((m, { pid, itemId }) => { (m[pid] ||= []).push(itemId); return m }, {})
  const histEntry = (text) => ({ at: nowIso(), by: profile?.name || '', text })
  const trashItems = useCallback(async (list, reason) => {
    const stamp = trashFields(reason)
    const names = []
    for (const [pid, ids] of Object.entries(byProject(list))) {
      const p = (dataRef.current.projects || []).find((x) => x.id === pid)
      const moving = (p?.items || []).filter((i) => ids.includes(i.id))
      if (!moving.length) continue
      names.push(...moving.map((i) => i.label))
      await save('projects', pid, {
        items: p.items.filter((i) => !ids.includes(i.id)),
        trashedItems: [...(p.trashedItems || []), ...moving.map((i) => ({ ...i, ...stamp }))],
        history: arrayUnion(histEntry(`Article mis à la corbeille : ${moving.map((i) => i.label).join(', ')}`))
      })
    }
    if (names.length) logAudit('produit en stock mis à la corbeille', 'projects', '', names.join(', '))
  }, [save, logAudit, profile])
  const restoreItems = useCallback(async (list) => {
    for (const [pid, ids] of Object.entries(byProject(list))) {
      const p = (dataRef.current.projects || []).find((x) => x.id === pid)
      const back = (p?.trashedItems || []).filter((i) => ids.includes(i.id))
      if (!back.length) continue
      const clean = back.map(({ deletedAt, deletedBy, deleteReason, purgeAt, ...it }) => it)
      await save('projects', pid, {
        items: [...(p.items || []), ...clean],
        trashedItems: p.trashedItems.filter((i) => !ids.includes(i.id)),
        history: arrayUnion(histEntry(`Article restauré : ${clean.map((i) => i.label).join(', ')}`))
      })
      logAudit('produit en stock restauré', 'projects', pid, clean.map((i) => i.label).join(', '))
    }
  }, [save, logAudit, profile])
  const purgeItems = useCallback(async (list) => {
    for (const [pid, ids] of Object.entries(byProject(list))) {
      const p = (dataRef.current.projects || []).find((x) => x.id === pid)
      if (!p?.trashedItems) continue
      await save('projects', pid, { trashedItems: p.trashedItems.filter((i) => !ids.includes(i.id)) })
      logAudit('produit en stock supprimé définitivement', 'projects', pid, p.trashedItems.filter((i) => ids.includes(i.id)).map((i) => i.label).join(', '))
    }
  }, [save, logAudit])

  // Nettoyage automatique : l'administrateur qui ouvre l'app supprime définitivement ce qui est à la corbeille depuis plus de 30 jours.
  const purged = useRef(false)
  useEffect(() => {
    if (!isAdmin || !online || purged.current || !data.projects || !data.sales) return
    purged.current = true
    const now = new Date().toISOString()
    data.projects.filter((p) => p.deletedAt && p.purgeAt && p.purgeAt < now).forEach((p) => purgeProject(p.id, `${p.number || ''} ${p.name || ''}`.trim()).catch(() => {}))
    data.sales.filter((x) => x.deletedAt && x.purgeAt && x.purgeAt < now).forEach((x) => purgeSale(x.id, x.number).catch(() => {}))
    const oldItems = data.projects.filter((p) => !p.deletedAt).flatMap((p) => (p.trashedItems || []).filter((i) => i.purgeAt && i.purgeAt < now).map((i) => ({ pid: p.id, itemId: i.id })))
    if (oldItems.length) purgeItems(oldItems).catch(() => {})
  }, [isAdmin, online, data.projects, data.sales, purgeProject, purgeSale, purgeItems])

  const value = {
    authUser, profile, active, settings: settings || DEFAULT_SETTINGS, settingsExists: !!settings, settingsReady, ref, rate, online, hasPending, toasts,
    D, costing, audit, save, saveSettings, write, notify, logAudit, nextNumber, isAdmin,
    verifyPassword, exportAll, restoreAll, locations, multiLoc: locations.length > 1, notifs, unreadNotifs, markNotifsSeen, pushSaleNotification, trashProject, restoreProject, purgeProject, trashItems, restoreItems, purgeItems, requestSaleDeletion, refuseSaleDeletion, trashSale, restoreSale, purgeSale,
    can: (p) => can(profile, p),
    logout: () => { try { localStorage.removeItem(`tb-profile-${authUser?.uid}`) } catch { /* rien */ } return signOut(auth) }
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
