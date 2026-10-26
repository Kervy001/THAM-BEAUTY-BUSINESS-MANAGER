import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../lib/store.jsx'
import { roleLabel } from '../lib/perms.js'
import { compressImage, dmId, tsMs, useChat, useMessages } from '../lib/chat.jsx'
import Icon from '../components/Icon.jsx'
import { Empty, Input, Modal, Notice } from '../components/ui.jsx'

const hhmm = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const dayLabel = (t) => {
  const d = new Date(t); const n = new Date()
  const k = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
  const y = new Date(n); y.setDate(n.getDate() - 1)
  return k(d) === k(n) ? "Aujourd'hui" : k(d) === k(y) ? 'Hier' : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}
const initialOf = (s) => (s || '?').trim().charAt(0).toUpperCase()
const Avatar = ({ text, tone = 'user', size = 40 }) => (
  <div style={{ width: size, height: size }} className={'grid shrink-0 place-items-center rounded-full text-sm font-bold ' + (tone === 'group' ? 'bg-ink text-gold-300' : tone === 'announce' ? 'bg-blush-500 text-white' : 'bg-gradient-to-b from-gold-300 to-gold-600 text-ink')}>{text}</div>
)
const iconFor = (c) => (c.type === 'announce' ? <Avatar tone="announce" text="📢" /> : c.type === 'general' || c.type === 'group' ? <Avatar tone="group" text={c.type === 'general' ? '#' : initialOf(c.title)} /> : <Avatar text={initialOf(c.title)} />)
const preview = (c) => (!c.lastMessage ? (c.type === 'announce' ? 'Annonces de l’administration' : c.type === 'general' ? 'Discussion de toute l’équipe' : 'Aucun message') : `${c.lastMessage.by ? (c.type === 'dm' ? '' : c.lastMessage.byName + ' : ') : ''}${c.lastMessage.image && !c.lastMessage.text ? '📷 Photo' : c.lastMessage.text}`)

export default function Messages() {
  const app = useApp()
  const chat = useChat()
  const nav = useNavigate()
  const { id } = useParams()
  const [newOpen, setNewOpen] = useState(false)
  const [q, setQ] = useState('')

  // une conversation privée pas encore créée : on la représente à partir de l'identifiant
  const current = useMemo(() => {
    if (!id) return null
    const found = chat.chats.find((c) => c.id === id)
    if (found) return found
    if (id.startsWith('dm_')) {
      const [, a, b] = id.split('_')
      const other = a === chat.me ? b : a
      if (a !== chat.me && b !== chat.me) return null
      return { id, type: 'dm', members: [a, b], other, title: chat.nameOf(other), unread: false }
    }
    return null
  }, [id, chat.chats, chat.me, chat.nameOf])

  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    const rows = chat.chats.filter((c) => c.type === 'general' || c.type === 'announce' || c.lastMessage || c.type === 'group')
    const sorted = [...rows].sort((a, b) => (a.type === 'announce' ? -2 : a.type === 'general' ? -1 : 0) - (b.type === 'announce' ? -2 : b.type === 'general' ? -1 : 0) || b.lastMs - a.lastMs)
    return t ? sorted.filter((c) => c.title.toLowerCase().includes(t)) : sorted
  }, [chat.chats, q])

  useEffect(() => { chat.setActiveId(id || null); return () => chat.setActiveId(null) }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="-mx-4 -mb-28 -mt-5 sm:-mx-6 lg:mx-0 lg:mb-0 lg:mt-0">
      <div className="flex h-[calc(100dvh-7.75rem)] min-h-[360px] overflow-hidden bg-white lg:h-[calc(100dvh-5rem)] lg:rounded-2xl lg:border lg:border-line lg:shadow-card">
        <aside className={'w-full shrink-0 flex-col border-line lg:flex lg:w-80 lg:border-r ' + (id ? 'hidden' : 'flex')}>
          <div className="flex items-center gap-2 p-3">
            <div className="relative flex-1">
              <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input className="input !pl-9" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button className="btn-gold btn-sm !h-10 !w-10 !p-0" onClick={() => setNewOpen(true)} aria-label="Nouvelle conversation"><Icon name="plus" size={18} strokeWidth={2.4} /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.map((c) => (
              <button key={c.id} onClick={() => nav(`/messages/${c.id}`)} className={'flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-paper ' + (c.id === id ? 'bg-paper' : '')}>
                {iconFor(c)}
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={'truncate text-sm ' + (c.unread ? 'font-bold' : 'font-semibold')}>{c.title}</span>
                    {c.lastMs > 0 && <span className="shrink-0 text-[10px] text-neutral-400">{hhmm(c.lastMs)}</span>}
                  </span>
                  <span className={'block truncate text-xs ' + (c.unread ? 'font-semibold text-neutral-800' : 'text-neutral-500')}>{preview(c)}</span>
                </span>
                {c.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-blush-500" />}
              </button>
            ))}
            {!list.some((c) => c.type === 'dm') && !q && <p className="px-4 py-6 text-center text-xs text-neutral-500">Touchez <b>+</b> pour écrire en privé à un collègue.</p>}
          </div>
        </aside>

        <section className={'min-w-0 flex-1 flex-col ' + (id ? 'flex' : 'hidden lg:flex')}>
          {current ? <Conversation key={current.id} chat={current} onBack={() => nav('/messages')} /> : (
            <div className="grid flex-1 place-items-center p-6">
              <Empty icon="chat">{id ? 'Cette conversation n’existe pas ou vous n’y avez pas accès.' : 'Choisissez une conversation, ou touchez + pour en commencer une.'}</Empty>
            </div>
          )}
        </section>
      </div>
      {newOpen && <NewChat onClose={() => setNewOpen(false)} onOpen={(cid) => { setNewOpen(false); nav(`/messages/${cid}`) }} />}
    </div>
  )
}

function Conversation({ chat, onBack }) {
  const app = useApp()
  const c = useChat()
  const { msgs, reads, loading } = useMessages(chat.id)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [view, setView] = useState(null)
  const [sel, setSel] = useState(null)
  const [manage, setManage] = useState(false)
  const bottom = useRef(null)
  const fileRef = useRef(null)
  const canWrite = chat.type !== 'announce' || app.isAdmin
  const members = chat.type === 'dm' ? 2 : chat.type === 'group' ? (chat.members || []).length : 0

  // défilement vers le bas + marquage « lu » quand de nouveaux messages arrivent
  const lastTs = msgs.length ? tsMs(msgs[msgs.length - 1].ts) : 0
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [msgs.length, loading])
  useEffect(() => {
    if (loading) return
    const mark = () => { if (document.visibilityState === 'visible') c.markRead(chat.id) }
    mark()
    document.addEventListener('visibilitychange', mark)
    return () => document.removeEventListener('visibilitychange', mark)
  }, [chat.id, lastTs, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e) {
    e?.preventDefault()
    if (busy || !text.trim()) return
    setBusy(true); setErr('')
    const t = text
    setText('')
    try { await c.send(chat, { text: t }) } catch (ex) { setErr(ex.code === 'permission-denied' ? `Envoi refusé par Firebase (étape : ${ex.step || '?'}). Vérifiez que les règles Firestore (Mizajou 14+) sont publiées.` : ex.message); setText(t) } finally { setBusy(false) }
  }
  async function pickImage(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true); setErr('')
    try { const image = await compressImage(f); await c.send(chat, { text: text.trim() ? text : '', image }); setText('') } catch (ex) { setErr(ex.message) } finally { setBusy(false) }
  }

  const rows = []
  let lastDay = ''
  msgs.forEach((m) => {
    const t = tsMs(m.ts)
    const d = dayLabel(t)
    if (d !== lastDay) { rows.push({ sep: d }); lastDay = d }
    rows.push({ m, t })
  })

  const tick = (m, t) => {
    const others = Object.entries(reads).filter(([u, r]) => u !== c.me && r >= t).length
    if (m.pending) return <span className="text-neutral-400">🕓</span>
    if (chat.type === 'dm') return <span className={others ? 'text-sky-500' : 'text-neutral-400'}>{others ? '✓✓' : '✓'}</span>
    return others ? <span className="text-sky-500" title="Lu par">✓✓ {others}</span> : <span className="text-neutral-400">✓</span>
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-3 py-2.5">
        <button className="grid h-9 w-9 place-items-center rounded-xl text-neutral-700 hover:bg-black/5 lg:hidden" onClick={onBack} aria-label="Retour"><Icon name="back" size={20} /></button>
        {iconFor(chat)}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{chat.title}</div>
          <div className="truncate text-[11px] text-neutral-500">
            {chat.type === 'dm' ? 'Conversation privée' : chat.type === 'general' ? 'Toute l’équipe' : chat.type === 'announce' ? (app.isAdmin ? 'Vous publiez pour toute l’équipe' : 'Lecture seule — publié par l’administration') : `${members} membres : ${(chat.members || []).map((u) => (u === c.me ? 'Vous' : c.nameOf(u))).join(', ')}`}
          </div>
        </div>
        {chat.type === 'group' && app.isAdmin && <button className="btn-ghost btn-sm" onClick={() => setManage(true)}><Icon name="settings" size={14} />Gérer</button>}
      </header>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-paper/60 px-3 py-3">
        {loading && <div className="py-10 text-center text-xs text-neutral-400">Chargement…</div>}
        {!loading && !msgs.length && <div className="py-10 text-center text-xs text-neutral-500">Aucun message pour l’instant.{canWrite ? ' Écrivez le premier !' : ''}</div>}
        {rows.map((r, i) => r.sep ? (
          <div key={'s' + i} className="py-2 text-center"><span className="rounded-full bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 ring-1 ring-line">{r.sep}</span></div>
        ) : (() => {
          const { m, t } = r
          const mine = m.by === c.me
          const canDel = mine || (app.isAdmin && chat.type !== 'dm')
          return (
            <div key={m.id} className={'flex ' + (mine ? 'justify-end' : 'justify-start')}>
              <div className={'max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm ' + (mine ? 'rounded-br-md bg-gradient-to-b from-gold-200 to-gold-300 text-ink' : 'rounded-bl-md bg-white text-neutral-900 ring-1 ring-line')} onClick={() => canDel && setSel(sel === m.id ? null : m.id)}>
                {!mine && chat.type !== 'dm' && <div className="mb-0.5 text-[11px] font-bold text-gold-700">{m.byName || c.nameOf(m.by)}</div>}
                {m.image && <img src={m.image} alt="Photo" className="mb-1 max-h-64 w-full cursor-zoom-in rounded-xl object-cover" onClick={(e) => { e.stopPropagation(); setView(m.image) }} />}
                {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
                <div className={'mt-0.5 flex items-center justify-end gap-1.5 text-[10px] ' + (mine ? 'text-ink/60' : 'text-neutral-400')}>
                  {hhmm(t)}{mine && tick(m, t)}
                </div>
                {sel === m.id && canDel && (
                  <button className="mt-1 w-full rounded-lg bg-blush-600 px-2 py-1 text-[11px] font-semibold text-white" onClick={async (e) => { e.stopPropagation(); setSel(null); try { await c.removeMessage(chat.id, m.id) } catch { setErr('Suppression refusée.') } }}>Supprimer ce message</button>
                )}
              </div>
            </div>
          )
        })())}
        <div ref={bottom} />
      </div>

      {err && <div className="px-3 pt-2"><Notice tone="red">{err}</Notice></div>}
      {canWrite ? (
        <form onSubmit={submit} className="flex items-end gap-2 border-t border-line bg-white p-2.5" style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
          <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-neutral-600 hover:bg-black/5" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Envoyer une photo"><Icon name="image" size={21} /></button>
          <textarea className="input max-h-32 min-h-[2.5rem] flex-1 resize-none !py-2.5" rows={1} placeholder="Votre message…" value={text} maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 1024px)').matches) submit(e) }} />
          <button type="submit" className="btn-gold !h-10 !w-10 shrink-0 !p-0" disabled={busy || !text.trim()} aria-label="Envoyer"><Icon name="send" size={19} /></button>
        </form>
      ) : <div className="border-t border-line bg-white p-3 text-center text-xs text-neutral-500">Seule l’administration peut publier ici.</div>}

      {view && <Modal title="Photo" onClose={() => setView(null)} wide><img src={view} alt="Photo" className="mx-auto max-h-[70vh] rounded-xl" /></Modal>}
      {manage && <ManageGroup chat={chat} onClose={() => setManage(false)} onDeleted={onBack} />}
    </>
  )
}

function UserPicker({ users, value, onChange, single }) {
  const app = useApp()
  return (
    <div className="max-h-64 divide-y divide-line/70 overflow-y-auto rounded-xl ring-1 ring-line">
      {users.map((u) => {
        const on = value.includes(u.id)
        return (
          <button type="button" key={u.id} onClick={() => onChange(single ? [u.id] : on ? value.filter((x) => x !== u.id) : [...value, u.id])} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-paper">
            <Avatar text={initialOf(u.name || u.email)} size={34} />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{u.name || u.email}</span><span className="block truncate text-[11px] text-neutral-500">{roleLabel(app.settings, u.role)}</span></span>
            {!single && <span className={'grid h-5 w-5 place-items-center rounded-md border ' + (on ? 'border-gold-500 bg-gold-400 text-ink' : 'border-line')}>{on && <Icon name="check" size={13} strokeWidth={3} />}</span>}
          </button>
        )
      })}
      {!users.length && <div className="p-4 text-center text-sm text-neutral-500">Aucun autre utilisateur actif.</div>}
    </div>
  )
}

function NewChat({ onClose, onOpen }) {
  const app = useApp()
  const c = useChat()
  const [mode, setMode] = useState('dm')
  const [sel, setSel] = useState([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const users = app.D.users.filter((u) => u.id !== c.me && u.active !== false)

  async function go() {
    setErr('')
    if (!sel.length) return setErr('Choisissez au moins une personne.')
    if (mode === 'dm') return onOpen(dmId(c.me, sel[0]))
    if (!name.trim()) return setErr('Donnez un nom au groupe.')
    setBusy(true)
    try { onOpen(await c.createGroup(name, sel)) } catch (ex) { setErr(ex.message); setBusy(false) }
  }
  return (
    <Modal title="Nouvelle conversation" onClose={onClose} footer={<><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-gold" onClick={go} disabled={busy}>{mode === 'dm' ? 'Ouvrir' : 'Créer le groupe'}</button></>}>
      <div className="space-y-3">
        {app.isAdmin && (
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-paper p-1">
            {[['dm', 'Message privé'], ['group', 'Groupe']].map(([k, l]) => (
              <button key={k} className={'rounded-xl px-3 py-2 text-sm font-semibold ' + (mode === k ? 'bg-ink text-gold-300' : 'text-neutral-500')} onClick={() => { setMode(k); setSel([]) }}>{l}</button>
            ))}
          </div>
        )}
        {mode === 'group' && <Input label="Nom du groupe" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="ex. Équipe boutique" />}
        <div className="text-xs font-medium text-neutral-500">{mode === 'dm' ? 'Écrire à :' : `Membres (${sel.length} choisi${sel.length > 1 ? 's' : ''}) :`}</div>
        <UserPicker users={users} value={sel} onChange={setSel} single={mode === 'dm'} />
        {err && <Notice tone="red">{err}</Notice>}
      </div>
    </Modal>
  )
}

function ManageGroup({ chat, onClose, onDeleted }) {
  const app = useApp()
  const c = useChat()
  const [name, setName] = useState(chat.title)
  const [sel, setSel] = useState((chat.members || []).filter((u) => u !== c.me))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const users = app.D.users.filter((u) => u.id !== c.me && u.active !== false)
  async function save() {
    if (!name.trim()) return setErr('Le nom est obligatoire.')
    setBusy(true)
    try { await c.updateGroup(chat.id, { name: name.trim().slice(0, 60), members: [...new Set([c.me, ...sel])] }); onClose() } catch (ex) { setErr(ex.message); setBusy(false) }
  }
  async function del() {
    if (!window.confirm('Supprimer ce groupe ? Les membres ne le verront plus.')) return
    setBusy(true)
    try { await c.deleteGroup(chat.id); onClose(); onDeleted() } catch (ex) { setErr(ex.message); setBusy(false) }
  }
  return (
    <Modal title="Gérer le groupe" onClose={onClose} footer={<><button className="btn-danger mr-auto" onClick={del} disabled={busy}>Supprimer</button><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-gold" onClick={save} disabled={busy}>Enregistrer</button></>}>
      <div className="space-y-3">
        <Input label="Nom du groupe" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <div className="text-xs font-medium text-neutral-500">Membres ({sel.length + 1}, vous inclus) :</div>
        <UserPicker users={users} value={sel} onChange={setSel} />
        {err && <Notice tone="red">{err}</Notice>}
      </div>
    </Modal>
  )
}
