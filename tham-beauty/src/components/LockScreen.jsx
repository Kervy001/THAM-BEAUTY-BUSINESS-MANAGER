import { useEffect, useState } from 'react'
import Logo from './Logo.jsx'
import Icon from './Icon.jsx'
import { checkPin, getTries, setTries as setTriesStore, hasBio, pinLength, setPin, PIN_RE, unlockBio } from '../lib/security.js'

const PW_ERR = {
  'auth/invalid-credential': 'Mot de passe incorrect.', 'auth/wrong-password': 'Mot de passe incorrect.', 'auth/invalid-login-credentials': 'Mot de passe incorrect.',
  'auth/too-many-requests': 'Trop de tentatives. Patientez quelques minutes.', 'auth/network-request-failed': 'Pas de connexion Internet.',
  'app/offline': 'Une connexion Internet est nécessaire pour vérifier votre mot de passe.', 'app/no-user': 'Session expirée : déconnectez-vous puis reconnectez-vous.'
}

// Demande le mot de passe du COMPTE (celui de la connexion) avant une action sensible : changer ou retrouver son PIN.
export function PasswordGate({ verify, onOk, onCancel, title, hint, dark }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    e.stopPropagation()
    setErr(''); setBusy(true)
    try { await verify(pw); onOk() } catch (ex) { setErr(PW_ERR[ex.code] || 'Vérification impossible. Réessayez.'); setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="w-full space-y-3 text-left">
      {title && <div className={'font-medium ' + (dark ? 'text-gold-300' : '')}>{title}</div>}
      {hint && <p className={'text-sm ' + (dark ? 'text-neutral-300' : 'text-neutral-600')}>{hint}</p>}
      <label className="block"><span className={'label ' + (dark ? '!text-neutral-300' : '')}>Mot de passe du compte</span>
        <input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus required /></label>
      {err && <div className="rounded-xl border border-blush-100 bg-blush-50 p-3 text-sm text-blush-600">{err}</div>}
      <div className="flex gap-2">
        {onCancel && <button type="button" className={'flex-1 ' + (dark ? 'rounded-xl bg-white/10 px-4 py-2.5 text-sm text-white' : 'btn-ghost')} onClick={onCancel}>Annuler</button>}
        <button className="btn-gold flex-1" disabled={busy || !pw}>{busy ? '…' : 'Continuer'}</button>
      </div>
    </form>
  )
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
const MAX_TRIES = 5

// Écran de verrouillage plein écran : PIN (clavier numérique) ou empreinte / visage du téléphone.
export function LockScreen({ uid, name, onUnlock, onLogout, verifyPassword }) {
  const len = pinLength(uid)
  const bio = hasBio(uid)
  const [pin, setPinVal] = useState('')
  const [err, setErr] = useState('')
  const [tries, setTriesState] = useState(() => getTries(uid))
  const setTries = (n) => { setTriesState(n); setTriesStore(uid, n) }
  useEffect(() => { if (tries >= MAX_TRIES) setMode('password') }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState('pin') // 'pin' | 'password' (PIN oublié / trop d'essais) | 'newpin'

  async function tryBio() {
    setErr('')
    if (await unlockBio(uid)) onUnlock()
    else setErr('Empreinte non reconnue. Entrez votre PIN.')
  }
  useEffect(() => { if (bio) { const t = setTimeout(tryBio, 350); return () => clearTimeout(t) } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function press(d) {
    if (busy) return
    const next = (pin + d).slice(0, len)
    setPinVal(next)
    setErr('')
    if (next.length < len) return
    setBusy(true)
    if (await checkPin(uid, next)) { setTries(0); onUnlock(); return }
    const t = tries + 1
    setTries(t)
    setPinVal('')
    setBusy(false)
    if (t >= MAX_TRIES) { setMode('password'); return } // trop d'essais : mot de passe du compte (sans se déconnecter)
    setErr(`PIN incorrect (${MAX_TRIES - t} essai${MAX_TRIES - t > 1 ? 's' : ''} restant${MAX_TRIES - t > 1 ? 's' : ''}).`)
    navigator.vibrate?.(120)
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 overflow-y-auto bg-ink px-6 py-8 text-white" style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
      <Logo size={72} />
      <div className="text-center">
        <div className="font-display text-xl font-semibold text-gold-300">Application verrouillée</div>
        {name && <div className="mt-1 text-sm text-neutral-400">{name}</div>}
      </div>
      {mode === 'pin' && (<>
        <div className="flex gap-3" aria-label="Code PIN">
          {Array.from({ length: len }, (_, i) => <span key={i} className={'h-3.5 w-3.5 rounded-full border border-gold-300 ' + (i < pin.length ? 'bg-gold-300' : 'bg-transparent')} />)}
        </div>
        <div className="h-5 text-sm text-blush-100">{err}</div>
        <div className="grid w-64 grid-cols-3 gap-3">
          {KEYS.map((k) => <button key={k} type="button" onClick={() => press(k)} className="h-14 rounded-2xl bg-white/10 text-xl font-semibold active:bg-white/20">{k}</button>)}
          {bio ? <button type="button" onClick={tryBio} className="grid h-14 place-items-center rounded-2xl bg-white/5 text-gold-300 active:bg-white/20" aria-label="Utiliser l'empreinte"><Icon name="fingerprint" size={26} /></button> : <span />}
          <button type="button" onClick={() => press('0')} className="h-14 rounded-2xl bg-white/10 text-xl font-semibold active:bg-white/20">0</button>
          <button type="button" onClick={() => { setPinVal(pin.slice(0, -1)); setErr('') }} className="grid h-14 place-items-center rounded-2xl bg-white/5 text-neutral-300 active:bg-white/20" aria-label="Effacer"><Icon name="back" size={22} /></button>
        </div>
        <button type="button" className="mt-2 text-sm text-neutral-400 underline" onClick={() => setMode('password')}>PIN oublié ?</button>
      </>)}
      {mode === 'password' && (
        <div className="w-full max-w-xs">
          <PasswordGate dark verify={verifyPassword} onOk={() => setMode('newpin')} onCancel={() => { setMode('pin'); setTries(0); setErr('') }}
            title="Retrouver l'accès" hint="Entrez le mot de passe de votre compte pour créer un nouveau PIN. Vous restez connecté et vous retrouvez la page où vous étiez." />
        </div>
      )}
      {mode === 'newpin' && (
        <div className="w-full max-w-xs rounded-3xl bg-white p-5 text-neutral-900">
          <PinForm uid={uid} title="Nouveau PIN" onDone={onUnlock} />
        </div>
      )}
      <button type="button" className="mt-1 text-xs text-neutral-500 underline" onClick={onLogout}>Se déconnecter</button>
    </div>
  )
}

// Création / changement de PIN (utilisé dans « Sécurité » et quand l'administrateur exige un PIN)
export function PinForm({ uid, onDone, onCancel, title = 'Créer un PIN' }) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    e.stopPropagation()
    setErr('')
    if (!PIN_RE.test(a)) return setErr('Le PIN doit avoir 4 à 6 chiffres.')
    if (a !== b) return setErr('Les deux PIN ne sont pas identiques.')
    setBusy(true)
    try { await setPin(uid, a); window.dispatchEvent(new Event('tb-security-changed')); onDone?.() } catch (ex) { setErr(ex.message); setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="font-medium">{title}</div>
      <label className="block"><span className="label">Nouveau PIN (4 à 6 chiffres)</span>
        <input className="input tracking-[0.5em]" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, ''))} required /></label>
      <label className="block"><span className="label">Confirmer le PIN</span>
        <input className="input tracking-[0.5em]" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, ''))} required /></label>
      {err && <div className="rounded-xl border border-blush-100 bg-blush-50 p-3 text-sm text-blush-600">{err}</div>}
      <div className="flex gap-2">
        {onCancel && <button type="button" className="btn-ghost flex-1" onClick={onCancel}>Annuler</button>}
        <button className="btn-gold flex-1" disabled={busy}>{busy ? '…' : 'Enregistrer le PIN'}</button>
      </div>
    </form>
  )
}

// Écran bloquant : l'administrateur exige un PIN et cet utilisateur n'en a pas encore
export function PinRequired({ uid, name, onLogout, onDone }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-ink p-6 text-white">
      <div className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 text-neutral-900 shadow-pop">
        <div className="flex items-center gap-3"><Logo size={44} /><div><div className="font-display text-lg font-semibold">Créez votre PIN</div><div className="text-xs text-neutral-500">{name}</div></div></div>
        <p className="text-sm text-neutral-600">L'administrateur demande que chaque utilisateur protège l'application avec un code PIN. Il sert à déverrouiller l'application sur ce téléphone.</p>
        <PinForm uid={uid} onDone={onDone} title="" />
        <button type="button" className="w-full text-center text-sm text-neutral-500 underline" onClick={onLogout}>Se déconnecter</button>
      </div>
    </div>
  )
}
