import { useState } from 'react'
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db, isConfigured } from '../lib/firebase.js'
import { useApp, DEFAULT_SETTINGS } from '../lib/store.jsx'
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
  const [mode, setMode] = useState('login')
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
        <h2 className="text-center text-sm font-medium text-neutral-600">
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
          {mode === 'login' && <button type="button" className="underline" onClick={() => setMode('setup')}>Première utilisation</button>}
        </div>
      </form>
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div className="grid min-h-screen place-items-center bg-neutral-900 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 text-center">
          <img src="icon-192.png" alt="" className="mx-auto mb-2 h-16 w-16 rounded-full" />
          <div className="font-serif text-xl font-bold text-neutral-900">THAM BEAUTY</div>
          <div className="text-[11px] uppercase tracking-widest text-rose-brand">Business Manager</div>
        </div>
        {children}
      </div>
    </div>
  )
}
