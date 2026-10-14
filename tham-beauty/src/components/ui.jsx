import { useEffect, useRef, useState } from 'react'
import { money } from '../lib/util.js'
import Icon from './Icon.jsx'

export function Field({ label, children, hint, className = '' }) {
  return (
    <label className={'block ' + className}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="mt-1.5 block text-xs text-neutral-500">{hint}</span>}
    </label>
  )
}

export function Input({ label, hint, className, ...p }) {
  return <Field label={label} hint={hint} className={className}><input className="input" {...p} /></Field>
}
export function NumberInput({ label, hint, className, value, onChange, ...p }) {
  return (
    <Field label={label} hint={hint} className={className}>
      <input className="input" type="number" inputMode="decimal" step="any" min="0" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...p} />
    </Field>
  )
}
export function Select({ label, hint, className, options, value, onChange, placeholder, ...p }) {
  return (
    <Field label={label} hint={hint} className={className}>
      <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...p}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const v = typeof o === 'string' ? o : o.value
          const l = typeof o === 'string' ? o : o.label
          return <option key={v} value={v}>{l}</option>
        })}
      </select>
    </Field>
  )
}
export function Textarea({ label, hint, className, ...p }) {
  return <Field label={label} hint={hint} className={className}><textarea className="input" rows={3} {...p} /></Field>
}

// Zone visible réelle de l'écran (tient compte du clavier virtuel sur téléphone)
function useVisualViewport() {
  const read = () => {
    const v = window.visualViewport
    return v ? { top: v.offsetTop, height: v.height } : { top: 0, height: window.innerHeight }
  }
  const [vp, setVp] = useState(read)
  useEffect(() => {
    const v = window.visualViewport
    const h = () => setVp(read())
    if (v) { v.addEventListener('resize', h); v.addEventListener('scroll', h) }
    window.addEventListener('resize', h)
    return () => { if (v) { v.removeEventListener('resize', h); v.removeEventListener('scroll', h) } window.removeEventListener('resize', h) }
  }, [])
  return vp
}

// Fenêtre contextuelle : se cale dans la zone visible (au-dessus du clavier), garde toujours le titre visible,
// et fait défiler le contenu à l'intérieur plutôt que de pousser la fenêtre hors de l'écran.
export function Modal({ title, onClose, children, wide, footer }) {
  const vp = useVisualViewport()
  const body = useRef(null)
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [onClose])
  // Quand on touche un champ, on le ramène au milieu de la zone visible (une fois le clavier ouvert)
  useEffect(() => {
    const el = body.current
    if (!el) return
    const onFocus = (e) => {
      const t = e.target
      if (!/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return
      setTimeout(() => t.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 320)
    }
    el.addEventListener('focusin', onFocus)
    return () => el.removeEventListener('focusin', onFocus)
  }, [])
  return (
    <div className="no-print fixed inset-x-0 z-50 flex items-end justify-center bg-ink/60 backdrop-blur-[2px] sm:items-center sm:p-4"
      style={{ top: vp.top, height: vp.height }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'slide-up flex w-full flex-col rounded-t-3xl bg-white shadow-pop sm:rounded-3xl ' + (wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
        style={{ maxHeight: 'calc(100% - max(env(safe-area-inset-top), 0px) - 2.5rem)' }}>
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-5">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <button className="grid h-8 w-8 place-items-center rounded-full bg-paper text-neutral-500 hover:text-neutral-900" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
          {children}
          {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
        </div>
      </div>
    </div>
  )
}

// Confirmation par mot de passe de l'administrateur (suppressions sensibles)
const PW_ERR = {
  'auth/invalid-credential': 'Code incorrect.', 'auth/wrong-password': 'Code incorrect.', 'auth/invalid-login-credentials': 'Code incorrect.',
  'auth/too-many-requests': 'Trop de tentatives. Patientez quelques minutes.', 'auth/network-request-failed': 'Pas de connexion Internet.',
  'app/offline': 'Connexion Internet requise pour vérifier votre code.', 'app/no-user': 'Session expirée : reconnectez-vous.'
}
export function PasswordConfirm({ title, children, confirmLabel = 'Confirmer', danger = true, verify, onConfirm, onClose, askReason }) {
  const [pw, setPw] = useState('')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      await verify(pw)
    } catch (ex) { setErr(PW_ERR[ex.code] || 'Vérification impossible. Réessayez.'); setBusy(false); return }
    try { await onConfirm(reason.trim()); onClose(true) } catch (ex) { setErr(ex.message || 'Erreur'); setBusy(false) }
  }
  return (
    <Modal title={title} onClose={() => onClose(false)}>
      <form onSubmit={submit} className="space-y-3">
        <div className="text-sm text-neutral-700">{children}</div>
        {askReason && <Input label="Motif (facultatif)" value={reason} onChange={(e) => setReason(e.target.value)} />}
        <Input label="Votre code de connexion (mot de passe administrateur)" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus />
        {err && <div className="rounded-xl border border-blush-100 bg-blush-50 p-3 text-sm text-blush-600">{err}</div>}
        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={() => onClose(false)}>Annuler</button>
          <button className={(danger ? 'btn-danger' : 'btn-primary') + ' flex-1'} disabled={busy || !pw}>{busy ? '…' : confirmLabel}</button>
        </div>
      </form>
    </Modal>
  )
}

const TONES = {
  gray: 'bg-neutral-100 text-neutral-600', green: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', red: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200', blue: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200', gold: 'bg-gold-100 text-gold-700 ring-1 ring-gold-300',
  pink: 'bg-blush-50 text-blush-600 ring-1 ring-blush-100'
}
export function Badge({ tone = 'gray', children }) {
  return <span className={'inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ' + TONES[tone]}>{children}</span>
}
export const payTone = (s) => ({ paye: 'green', partiel: 'amber', impaye: 'red', trop_percu: 'blue', trop_paye: 'blue' }[s] || 'gray')

export function Stat({ label, value, sub, tone, icon }) {
  const color = tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-blush-600' : 'text-neutral-900'
  return (
    <div className="card !p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] leading-snug text-neutral-500">{label}</div>
        {icon && <Icon name={icon} size={16} className="text-gold-500" />}
      </div>
      <div className={'mt-2 text-[1.35rem] font-semibold leading-tight tracking-tight ' + color}>{value}</div>
      {sub && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
    </div>
  )
}
// Liste « livre de comptes » : une ligne par indicateur, séparée par un filet. Plus lisible qu'un mur de cartes.
export function Ledger({ title, note, children }) {
  return (
    <section className="card !p-0">
      <h3 className="px-5 pb-1 pt-4 font-display text-base font-semibold">{title}</h3>
      <dl className="px-5 pb-2">{children}</dl>
      {note && <p className="border-t border-line/70 px-5 py-3 text-xs leading-relaxed text-neutral-500">{note}</p>}
    </section>
  )
}
export function Row({ label, value, sub, tone, strong }) {
  const color = tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-blush-600' : 'text-neutral-900'
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line/70 py-2.5 first:border-t-0">
      <dt className="min-w-0 text-sm text-neutral-600">{label}{sub && <span className="block text-xs text-neutral-400">{sub}</span>}</dt>
      <dd className={'shrink-0 text-right tabular-nums ' + (strong ? 'text-base font-semibold ' : 'text-sm font-medium ') + color}>{value}</dd>
    </div>
  )
}
export const MoneyRow = ({ label, v, cur, sub, signed, strong }) => (
  <Row label={label} sub={sub} strong={strong} value={money(v, cur)} tone={signed ? (v > 0.004 ? 'good' : v < -0.004 ? 'bad' : undefined) : undefined} />
)
export const MoneyStat = ({ label, v, cur, sub, signed, icon }) => (
  <Stat label={label} icon={icon} value={money(v, cur)} sub={sub} tone={signed ? (v >= 0 ? 'good' : 'bad') : undefined} />
)

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[1.7rem] font-semibold leading-tight">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-neutral-500">{subtitle}</div>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

export function Empty({ children, icon = 'layers' }) {
  return (
    <div className="rounded-2xl border border-dashed border-gold-400/50 bg-white/60 p-8 text-center text-sm text-neutral-500">
      <Icon name={icon} size={26} className="mx-auto mb-2 text-gold-400" />
      {children}
    </div>
  )
}

export function Table({ head, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px]">
        <thead className="border-b border-line"><tr>{head.map((h, i) => <th key={i} className="th">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line/70">{children}</tbody>
      </table>
    </div>
  )
}

export function Notice({ tone = 'amber', children }) {
  const t = { amber: 'border-gold-300 bg-gold-100/50 text-neutral-800', red: 'border-blush-100 bg-blush-50 text-blush-600', blue: 'border-sky-200 bg-sky-50 text-sky-900' }[tone]
  return <div className={'rounded-xl border p-3 text-sm ' + t}>{children}</div>
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="no-scrollbar mb-5 flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 ring-1 ring-line">
      {tabs.map((t) => (
        <button key={t} onClick={() => onChange(t)} className={'whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition ' + (value === t ? 'bg-ink text-gold-300 shadow-sm' : 'text-neutral-500 hover:text-neutral-900')}>{t}</button>
      ))}
    </div>
  )
}

function useOutside(ref, onClose) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const k = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', h)
    document.addEventListener('touchstart', h)
    document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h); document.removeEventListener('keydown', k) }
  }, [ref, onClose])
}

// Menu déroulant à liste d'options (remplace les boutons de période)
export function Dropdown({ icon, value, options, onChange, className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false))
  const current = options.find((o) => o.value === value)
  return (
    <div ref={ref} className={'relative ' + className}>
      <button type="button" className="btn-ghost" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}>
        {icon && <Icon name={icon} size={16} className="text-gold-600" />}
        <span>{current?.label}</span>
        <Icon name="chevron" size={14} className={'text-neutral-400 transition ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && (
        <ul role="listbox" className="pop-in absolute left-0 z-30 mt-2 min-w-[14rem] overflow-hidden rounded-2xl bg-white p-1.5 shadow-pop ring-1 ring-line">
          {options.map((o) => (
            <li key={o.value}>
              <button type="button" role="option" aria-selected={o.value === value} onClick={() => { onChange(o.value); setOpen(false) }}
                className={'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm ' + (o.value === value ? 'bg-ink text-gold-300' : 'hover:bg-paper')}>
                {o.label}{o.value === value && <Icon name="check" size={14} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Panneau déroulant libre (filtres)
export function Popover({ trigger, children, className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false))
  return (
    <div ref={ref} className={'relative ' + className}>
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open && <div className="pop-in absolute left-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl bg-white p-4 shadow-pop ring-1 ring-line">{children}</div>}
    </div>
  )
}

export function Toasts({ items }) {
  if (!items.length) return null
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
      {items.map((t) => (
        <div key={t.id} className={'pop-in pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-sm font-medium shadow-pop ' + (t.tone === 'error' ? 'bg-blush-600 text-white' : t.tone === 'warn' ? 'bg-gold-300 text-ink' : 'bg-ink text-gold-200')}>{t.msg}</div>
      ))}
    </div>
  )
}

export function confirmAsk(msg) { return window.confirm(msg) }
