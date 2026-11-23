import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db, isConfigured } from '../lib/firebase.js'
import { useApp, DEFAULT_SETTINGS } from '../lib/store.jsx'
import Logo from '../components/Logo.jsx'
import { ROLES } from '../lib/perms.js'
import { nowIso } from '../lib/util.js'
import { Notice } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'

const msg = (e) => ({
  'auth/invalid-credential': 'Identifiant ou mot de passe incorrect.',
  'auth/invalid-email': 'Adresse e-mail invalide.',
  'auth/weak-password': 'Mot de passe trop faible (minimum 8 caractères).',
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
      <form onSubmit={submit}>
        <h2 className="text-center text-xl font-bold">
          {mode === 'login' ? 'THAM Beauty' : mode === 'reset' ? 'Récupération du compte' : "Créer l'administrateur"}
        </h2>
        <div className="mb-6 mt-0.5 text-center text-[12px] uppercase tracking-[0.2em] opacity-80">{mode === 'login' ? 'Business Manager' : mode === 'reset' ? 'Lien par e-mail' : 'Première configuration'}</div>
        {mode === 'setup' && <Field icon="users" placeholder="Votre nom" value={name} onChange={(e) => setName(e.target.value)} required />}
        <Field icon="mail" type="email" placeholder="Adresse e-mail" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {mode !== 'reset' && <Field icon="lock" type="password" placeholder="Mot de passe" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} />}
        {err && <div className="mb-3 rounded-xl bg-white/90 p-2.5 text-sm font-medium text-red-700">{err}</div>}
        {info && <div className="mb-3 rounded-xl bg-white/90 p-2.5 text-sm font-medium text-sky-800">{info}</div>}
        <div className="mb-5 mt-1 flex justify-end text-xs">
          {mode === 'login' ? <button type="button" className="lg-link" onClick={() => setMode('reset')}>Mot de passe oublié ?</button> : <button type="button" className="lg-link" onClick={() => setMode('login')}>← Connexion</button>}
        </div>
        <RippleButton busy={busy}>{mode === 'login' ? 'SE CONNECTER' : mode === 'reset' ? 'ENVOYER LE LIEN' : "CRÉER L'ADMINISTRATEUR"}</RippleButton>
      </form>
    </Shell>
  )
}

// Champ à liseré : icône à gauche, œil pour afficher le mot de passe
function Field({ icon, type = 'text', ...rest }) {
  const [show, setShow] = useState(false)
  const pw = type === 'password'
  return (
    <div className="lg-field">
      <Icon name={icon} size={20} className="opacity-90" />
      <input type={pw && show ? 'text' : type} aria-label={rest.placeholder} {...rest} />
      {pw && <button type="button" onClick={() => setShow(!show)} className="opacity-90 transition hover:opacity-100" aria-label={show ? 'Masquer' : 'Afficher'}><Icon name={show ? 'eyeoff' : 'eye'} size={20} /></button>}
    </div>
  )
}

// Bouton principal : reflet qui passe, vague au clic, flèche qui avance, rond qui tourne pendant la connexion
function RippleButton({ busy, children }) {
  const [rips, setRips] = useState([])
  function down(e) {
    const r = e.currentTarget.getBoundingClientRect()
    const id = Math.random()
    setRips((x) => [...x, { id, x: e.clientX - r.left - 20, y: e.clientY - r.top - 20 }])
    setTimeout(() => setRips((x) => x.filter((v) => v.id !== id)), 650)
  }
  return (
    <button className="lg-btn" disabled={busy} onPointerDown={down}>
      {rips.map((v) => <span key={v.id} className="lg-ripple" style={{ left: v.x, top: v.y, width: 40, height: 40 }} />)}
      {busy ? <span className="lg-spin" /> : <>{children}<Icon name="arrow" size={18} strokeWidth={2.4} className="lg-arrow" /></>}
    </button>
  )
}

const FLOATERS = [['trend', 'left:7%;top:16%;--d:0s'], ['coin', 'left:14%;top:64%;--d:1.2s'], ['wallet', 'left:30%;top:84%;--d:.6s'], ['receipt', 'right:9%;top:18%;--d:1.8s'], ['package', 'right:14%;top:68%;--d:.9s'], ['chart', 'right:30%;top:7%;--d:2.4s']]

function Shell({ children }) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden p-4 pt-16">
      <div className="lg-mesh" aria-hidden="true" />
      <div aria-hidden="true" className="hidden sm:block">
        {FLOATERS.map(([n, pos]) => <div key={n} className="lg-ico" style={Object.fromEntries(pos.split(';').map((x) => x.split(':')))}><Icon name={n} size={26} /></div>)}
      </div>
      <div className="lg-card">
        <div className="lg-logo"><Logo size={92} /></div>
        {children}
        <div className="mt-5 text-center text-[11px] tracking-[0.3em] opacity-85">GÉREZ · INVESTISSEZ · VENDEZ</div>
      </div>
      <p className="relative z-[2] mt-4 text-center text-[11px] text-white/80">Fonctionne aussi hors ligne après la première connexion</p>
    </div>
  )
}
