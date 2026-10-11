import { useEffect } from 'react'
import { money } from '../lib/util.js'

export function Field({ label, children, hint, className = '' }) {
  return (
    <label className={'block ' + className}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
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

export function Modal({ title, onClose, children, wide, footer }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = '' }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl ' + (wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        {children}
        {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

const TONES = {
  gray: 'bg-neutral-100 text-neutral-700', green: 'bg-emerald-100 text-emerald-800', red: 'bg-red-100 text-red-800',
  amber: 'bg-amber-100 text-amber-800', blue: 'bg-sky-100 text-sky-800', gold: 'bg-yellow-100 text-yellow-800'
}
export function Badge({ tone = 'gray', children }) {
  return <span className={'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ' + TONES[tone]}>{children}</span>
}
export const payTone = (s) => ({ paye: 'green', partiel: 'amber', impaye: 'red', trop_percu: 'blue', trop_paye: 'blue' }[s] || 'gray')

export function Stat({ label, value, sub, tone }) {
  const color = tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-700' : 'text-neutral-900'
  return (
    <div className="card !p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={'mt-1 text-lg font-semibold leading-tight ' + color}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-500">{sub}</div>}
    </div>
  )
}
export const MoneyStat = ({ label, v, cur, sub, signed }) => (
  <Stat label={label} value={money(v, cur)} sub={sub} tone={signed ? (v >= 0 ? 'good' : 'bad') : undefined} />
)

export function PageHeader({ title, children, back }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

export function Empty({ children }) {
  return <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">{children}</div>
}

export function Table({ head, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px]">
        <thead className="border-b border-neutral-200"><tr>{head.map((h, i) => <th key={i} className="th">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-neutral-100">{children}</tbody>
      </table>
    </div>
  )
}

export function Notice({ tone = 'amber', children }) {
  const t = { amber: 'border-amber-300 bg-amber-50 text-amber-900', red: 'border-red-300 bg-red-50 text-red-900', blue: 'border-sky-300 bg-sky-50 text-sky-900' }[tone]
  return <div className={'rounded-lg border p-3 text-sm ' + t}>{children}</div>
}

export function confirmAsk(msg) { return window.confirm(msg) }
