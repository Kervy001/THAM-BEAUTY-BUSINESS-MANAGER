// Messagerie interne : conversations privées, groupes (créés par l'administrateur), canal général et annonces.
// Données Firestore :
//   chats/{id}            { type: 'dm'|'group'|'general'|'announce', members?, name?, createdBy, lastMessage, lastAt }
//   chats/{id}/messages   { text, image?, by, byName, ts }
//   chats/{id}/reads/{uid}{ ts }            (confirmations de lecture : visibles par les membres)
//   chatState/{uid}       { reads: { [chatId]: ts } }   (mon état « non lu » : privé)
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { collection, doc, onSnapshot, setDoc, deleteDoc, addDoc, query, where, orderBy, limit, serverTimestamp, writeBatch, updateDoc } from 'firebase/firestore'
import { db } from './firebase.js'
import { useApp } from './store.jsx'
import { beep, systemNotify } from './alerts.js'

export const GENERAL = 'general'
export const ANNOUNCE = 'announce'
export const dmId = (a, b) => { const [x, y] = [a, b].sort(); return `dm_${x}_${y}` }
const ms = (t) => (t?.toMillis ? t.toMillis() : t ? Number(t) || 0 : 0)
export const tsMs = (t, pendingNow = true) => (t?.toMillis ? t.toMillis() : pendingNow ? Date.now() : 0)

const Ctx = createContext(null)
export const useChat = () => useContext(Ctx)

export function ChatProvider({ children }) {
  const app = useApp()
  const me = app.authUser?.uid
  const myName = app.profile?.name || app.profile?.email || ''
  const [chatDocs, setChatDocs] = useState({}) // id -> chat
  const [state, setState] = useState({}) // chatId -> ts de ma dernière lecture
  const [activeId, setActiveId] = useState(null)
  const activeRef = useRef(null)
  activeRef.current = activeId
  const startedMs = useRef(Date.now())

  // Mes conversations (privées + groupes), et les deux canaux communs
  useEffect(() => {
    if (!me) return
    const parts = { mine: {}, general: null, announce: null }
    const push = () => setChatDocs({ ...parts.mine, ...(parts.general ? { [GENERAL]: parts.general } : {}), ...(parts.announce ? { [ANNOUNCE]: parts.announce } : {}) })
    const first = { mine: true, general: true, announce: true }
    const alertFor = (c) => {
      if (!c.lastMessage || c.lastMessage.by === me) return
      if (c.id === activeRef.current && document.visibilityState === 'visible') return
      if (ms(c.lastAt) < startedMs.current - 5000) return
      const who = c.type === 'dm' ? c.lastMessage.byName : `${c.lastMessage.byName} · ${c.name || (c.id === GENERAL ? 'Général' : c.id === ANNOUNCE ? 'Annonces' : 'Groupe')}`
      const text = c.lastMessage.image && !c.lastMessage.text ? '📷 Photo' : c.lastMessage.text
      app.notify(`💬 ${who} : ${text}`.slice(0, 140))
      beep()
      systemNotify('THAM BEAUTY — nouveau message', `${who} : ${text}`.slice(0, 140), 'tb-chat')
    }
    const un = []
    un.push(onSnapshot(query(collection(db, 'chats'), where('members', 'array-contains', me)), (snap) => {
      snap.docChanges().forEach((ch) => {
        if (ch.type === 'removed') delete parts.mine[ch.doc.id]
        else {
          const c = { id: ch.doc.id, ...ch.doc.data({ serverTimestamps: 'estimate' }) }
          parts.mine[c.id] = c
          if (!first.mine && !ch.doc.metadata.hasPendingWrites) alertFor(c)
        }
      })
      first.mine = false
      push()
    }, () => {}))
    ;[[GENERAL, 'general'], [ANNOUNCE, 'announce']].forEach(([id, key]) => {
      un.push(onSnapshot(doc(db, 'chats', id), (d) => {
        if (d.exists()) {
          const c = { id, ...d.data({ serverTimestamps: 'estimate' }) }
          parts[key] = c
          if (!first[key] && !d.metadata.hasPendingWrites) alertFor(c)
        }
        first[key] = false
        push()
      }, () => {}))
    })
    un.push(onSnapshot(doc(db, 'chatState', me), (d) => setState(d.exists() ? d.data().reads || {} : {}), () => {}))
    return () => un.forEach((u) => u())
  }, [me]) // eslint-disable-line react-hooks/exhaustive-deps

  // Liste des conversations, avec titre et état « non lu »
  const users = app.D.users
  const nameOf = useCallback((uid) => users.find((u) => u.id === uid)?.name || users.find((u) => u.id === uid)?.email || 'Utilisateur', [users])
  const chats = useMemo(() => {
    const virtual = [
      { id: GENERAL, type: 'general', name: 'Général', ...(chatDocs[GENERAL] || {}) },
      { id: ANNOUNCE, type: 'announce', name: 'Annonces', ...(chatDocs[ANNOUNCE] || {}) }
    ]
    const real = Object.values(chatDocs).filter((c) => c.id !== GENERAL && c.id !== ANNOUNCE)
    return [...virtual, ...real].map((c) => {
      const other = c.type === 'dm' ? (c.members || []).find((m) => m !== me) : null
      const title = c.type === 'dm' ? nameOf(other) : c.name || 'Groupe'
      const lastMs = c.lastAt ? tsMs(c.lastAt) : 0
      const unread = !!c.lastMessage && c.lastMessage.by !== me && lastMs > ms(state[c.id])
      return { ...c, title, other, lastMs, unread }
    })
  }, [chatDocs, state, me, nameOf])
  const unreadCount = chats.filter((c) => c.unread).length

  const markRead = useCallback(async (chatId) => {
    if (!me) return
    try {
      const b = writeBatch(db)
      b.set(doc(db, 'chatState', me), { reads: { [chatId]: serverTimestamp() } }, { merge: true })
      b.set(doc(db, 'chats', chatId, 'reads', me), { ts: serverTimestamp(), name: myName })
      await b.commit()
    } catch { /* hors ligne : réessayé à la prochaine ouverture */ }
  }, [me, myName])

  const ensureChat = useCallback(async (chat, patch) => {
    // crée la conversation si elle n'existe pas encore (canaux communs, conversation privée)
    await setDoc(doc(db, 'chats', chat.id), patch, { merge: true })
  }, [])

  const send = useCallback(async (chat, { text = '', image = '' }) => {
    const t = String(text).trim().slice(0, 2000)
    if (!t && !image) return
    const msg = { text: t, by: me, byName: myName, ts: serverTimestamp(), ...(image ? { image } : {}) }
    const last = { text: t.slice(0, 120), by: me, byName: myName, ...(image ? { image: true } : {}) }
    const exists = !!chatDocs[chat.id]
    const step = async (name, p) => { try { return await p } catch (e) { e.step = name; throw e } }
    if (!exists) {
      // première utilisation de cette conversation
      // merge : si l'autre personne a créé la conversation entre-temps, on ne change que le dernier message
      if (chat.type === 'dm') await step('conversation', setDoc(doc(db, 'chats', chat.id), { type: 'dm', members: [...chat.members].sort(), lastMessage: last, lastAt: serverTimestamp() }, { merge: true }))
      else await step('conversation', setDoc(doc(db, 'chats', chat.id), { type: chat.type, name: chat.name, lastMessage: last, lastAt: serverTimestamp() }, { merge: true }))
    } else {
      await step('dernier message', updateDoc(doc(db, 'chats', chat.id), { lastMessage: last, lastAt: serverTimestamp() }))
    }
    await step('message', addDoc(collection(db, 'chats', chat.id, 'messages'), msg))
  }, [me, myName, chatDocs])

  const removeMessage = useCallback((chatId, mid) => deleteDoc(doc(db, 'chats', chatId, 'messages', mid)), [])

  const createGroup = useCallback(async (name, members) => {
    const id = 'g_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4)
    await setDoc(doc(db, 'chats', id), { type: 'group', name: String(name).trim().slice(0, 60), members: [...new Set([me, ...members])], createdBy: me, createdAt: serverTimestamp(), lastAt: serverTimestamp() })
    return id
  }, [me])
  const updateGroup = useCallback((id, patch) => updateDoc(doc(db, 'chats', id), patch), [])
  const deleteGroup = useCallback((id) => deleteDoc(doc(db, 'chats', id)), [])

  const value = { chats, unreadCount, activeId, setActiveId, markRead, send, removeMessage, createGroup, updateGroup, deleteGroup, ensureChat, nameOf, me }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// Messages d'une conversation (les 100 derniers) + lectures des autres membres
export function useMessages(chatId) {
  const [msgs, setMsgs] = useState([])
  const [reads, setReads] = useState({})
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setMsgs([]); setReads({}); setLoading(true)
    if (!chatId) return
    const u1 = onSnapshot(query(collection(db, 'chats', chatId, 'messages'), orderBy('ts', 'desc'), limit(100)), (snap) => {
      setMsgs(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }), pending: d.metadata.hasPendingWrites })).reverse())
      setLoading(false)
    }, () => setLoading(false))
    const u2 = onSnapshot(collection(db, 'chats', chatId, 'reads'), (snap) => {
      const r = {}
      snap.docs.forEach((d) => { r[d.id] = ms(d.data().ts) })
      setReads(r)
    }, () => {})
    return () => { u1(); u2() }
  }, [chatId])
  return { msgs, reads, loading }
}

// Réduit une photo (≈ 900 px, JPEG) pour la stocker directement dans le message, sans Firebase Storage
export function compressImage(file, max = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) return reject(new Error('Ce fichier n’est pas une image.'))
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      let out = c.toDataURL('image/jpeg', quality)
      if (out.length > 380000) out = c.toDataURL('image/jpeg', 0.5)
      if (out.length > 380000) return reject(new Error('Photo trop lourde. Essayez une autre photo.'))
      resolve(out)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Impossible de lire cette image.')) }
    img.src = url
  })
}
