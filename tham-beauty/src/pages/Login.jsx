import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db, isConfigured } from '../lib/firebase.js'
import { useApp, DEFAULT_SETTINGS } from '../lib/store.jsx'
import Logo from '../components/Logo.jsx'
import { ROLES } from '../lib/perms.js'
import { nowIso } from '../lib/util.js'
import { Input, Notice } from '../components/ui.jsx'

const msg = (e) => ({
  'auth/invalid-credential': 'Identifiant ou mot de passe incorrect.',
  'auth/invalid-email': 'Adresse e-mail invalide.',
  'auth/weak-password': 'Mot de passe trop faible (minimum 6 caractères).',
  'auth/email-already-in-use': 'Cette adresse est déjà utilisée.',
  'auth/too-many-requests': 'Trop de tentatives. Réessayez dans quelques minutes.',
  'permission-denied': "Refusé : l'application est déjà initialisée. Demandez un compte à l'administrateur."
}[e.code] || e.message)

export default function Login() {
  const app = useApp()
  // La création du premier administrateur n'est plus affichée aux vendeurs : elle n'est accessible que par l'adresse
  // secrète  …/#/premiere-utilisation  (et les règles Firebase la refusent de toute façon une fois l'app initialisée).
  const loc = useLocation()
  const [mode, setMode] = useState(loc.pathname === '/premiere-utilisation' ? 'setup' : 'login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [fails, setFails] = useState(0)
  const [lockUntil, setLockUntil] = useState(0)

  if (!isConfigured) {
    return (
      <Shell>
        <Notice tone="red">
          Firebase n'est pas encore configuré. Ouvrez <b>src/lib/firebaseConfig.js</b> et collez les valeurs de votre projet Firebase
          (voir le guide LISEZ-MOI). Ensuite relancez le déploiement.
        </Notice>
      </Shell>
    )
  }
  if (app.authUser && (app.profile === null || app.profile?.active === false)) {
    return (
      <Shell>
        <Notice tone="amber">
          {app.profile?.active === false ? 'Ce compte est désactivé.' : "Votre compte n'a pas encore de profil dans l'application."}
          {' '}Contactez l'administrateur.
        </Notice>
        <button className="btn-ghost mt-3 w-full" onClick={app.logout}>Se déconnecter</button>
      </Shell>
    )
  }

  async function submit(e) {
    e.preventDefault()
    setErr(''); setInfo('')
    if (Date.now() < lockUntil) { setErr('Trop de tentatives, patientez quelques secondes.'); return }
    setBusy(true)
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), pw)
        setFails(0)
      } else if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email.trim())
        setInfo('Un e-mail de réinitialisation a été envoyé.')
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw)
        await setDoc(doc(db, 'users', cred.user.uid), {
          name: name || 'Administrateur', email: email.trim(), role: 'admin', perms: ROLES.admin.perms, active: true, createdAt: nowIso()
        })
        await setDoc(doc(db, 'settings', 'main'), { ...DEFAULT_SETTINGS, createdAt: nowIso() })
      }
    } catch (ex) {
      setErr(msg(ex))
      if (mode === 'login') {
        const f = fails + 1
        setFails(f)
        if (f >= 5) { setLockUntil(Date.now() + 30000); setFails(0) }
      }
    } finally { setBusy(false) }
  }

  return (
    <Shell>
      <form onSubmit={submit} className="space-y-3">
        <h2 className="text-center font-display text-lg font-semibold">
          {mode === 'login' ? 'Connexion' : mode === 'reset' ? 'Récupération du compte' : "Première configuration : créer l'administrateur"}
        </h2>
        {mode === 'setup' && <Input label="Votre nom" value={name} onChange={(e) => setName(e.target.value)} required />}
        <Input label="Adresse e-mail" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {mode !== 'reset' && <Input label="Mot de passe" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} />}
        {err && <Notice tone="red">{err}</Notice>}
        {info && <Notice tone="blue">{info}</Notice>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? '…' : mode === 'login' ? 'Se connecter' : mode === 'reset' ? 'Envoyer le lien' : "Créer l'administrateur"}</button>
        <div className="flex justify-between text-xs text-neutral-500">
          {mode === 'login' ? <button type="button" className="underline" onClick={() => setMode('reset')}>Mot de passe oublié ?</button> : <button type="button" className="underline" onClick={() => setMode('login')}>← Connexion</button>}
        </div>
      </form>
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div className="grid min-h-screen place-items-center p-4" style={{ background: 'radial-gradient(90% 60% at 50% 0%, rgba(201,154,62,.30), transparent 60%), radial-gradient(60% 40% at 90% 100%, rgba(240,86,143,.18), transparent 60%), #0b0b0d' }}>
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Logo size={150} className="mx-auto shadow-glow" />
          <div className="mt-4 font-display text-2xl font-bold tracking-wide gold-text">THAM BEAUTY</div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-blush-400">Business Manager</div>
        </div>
        <div className="slide-up rounded-3xl bg-white p-6 shadow-pop">{children}</div>
        <p className="mt-4 text-center text-[11px] text-neutral-500">Fonctionne aussi hors ligne après la première connexion</p>
      </div>
    </div>
  )
}
