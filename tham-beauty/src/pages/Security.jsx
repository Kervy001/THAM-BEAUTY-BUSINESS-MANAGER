import { useEffect, useState } from 'react'
import { useApp } from '../lib/store.jsx'
import { bioSupported, enableBio, getLockOpts, hasBio, hasPin, LOCK_CHOICES, removeBio, removePin, setLockOpts, checkPin } from '../lib/security.js'
import { PinForm } from '../components/LockScreen.jsx'
import { Notice, PageHeader, Select } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'

// Sécurité de l'appareil : PIN, empreinte / visage, verrouillage automatique. Disponible pour TOUS les utilisateurs.
export default function Security() {
  const app = useApp()
  const uid = app.authUser?.uid
  const policy = app.settings?.security || {}
  const [, bump] = useState(0)
  const refresh = () => bump((v) => v + 1)
  const [form, setForm] = useState(false)
  const [bioOk, setBioOk] = useState(false)
  const [msg, setMsg] = useState('')
  const [removing, setRemoving] = useState(false)
  const [cur, setCur] = useState('')
  useEffect(() => { bioSupported().then(setBioOk) }, [])
  const pin = hasPin(uid)
  const bio = hasBio(uid)
  const o = getLockOpts(uid, policy)
  const setO = (patch) => { setLockOpts(uid, { ...o, ...patch }); window.dispatchEvent(new Event('tb-security-changed')); refresh() }

  async function toggleBio() {
    setMsg('')
    try {
      if (bio) removeBio(uid)
      else await enableBio(uid, app.profile?.name)
      refresh()
    } catch (e) { setMsg(e?.name === 'NotAllowedError' ? 'Opération annulée ou refusée. Vérifiez qu’une empreinte / un visage est enregistré dans les réglages du téléphone.' : 'Impossible d’activer l’empreinte sur cet appareil.') }
  }
  async function doRemove(e) {
    e.preventDefault()
    if (await checkPin(uid, cur)) { removePin(uid); window.dispatchEvent(new Event('tb-security-changed')); setRemoving(false); setCur(''); setMsg(''); refresh() } else setMsg('PIN incorrect.')
  }

  return (
    <>
      <PageHeader title="Sécurité" subtitle="Protégez l'application sur ce téléphone avec un PIN et/ou votre empreinte." />
      <div className="space-y-4">
        <div className="card space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div><div className="font-medium">Code PIN</div><div className="text-sm text-neutral-500">{pin ? 'Activé sur cet appareil' : 'Non créé'}</div></div>
            {!form && !removing && <button className="btn-gold" onClick={() => setForm(true)}>{pin ? 'Changer' : 'Créer un PIN'}</button>}
          </div>
          {form && <PinForm uid={uid} onDone={() => { setForm(false); refresh() }} onCancel={() => setForm(false)} title={pin ? 'Nouveau PIN' : 'Créer un PIN'} />}
          {pin && !form && !policy.requirePin && !removing && <button className="text-sm text-blush-600 underline" onClick={() => setRemoving(true)}>Supprimer le PIN</button>}
          {pin && policy.requirePin && <p className="text-xs text-neutral-500">L'administrateur exige un PIN : il ne peut pas être supprimé.</p>}
          {removing && (
            <form onSubmit={doRemove} className="space-y-2">
              <label className="block"><span className="label">Entrez votre PIN actuel pour le supprimer</span>
                <input className="input" type="password" inputMode="numeric" maxLength={6} value={cur} onChange={(e) => setCur(e.target.value.replace(/\D/g, ''))} autoFocus /></label>
              <div className="flex gap-2"><button type="button" className="btn-ghost flex-1" onClick={() => { setRemoving(false); setCur('') }}>Annuler</button><button className="btn-danger flex-1">Supprimer</button></div>
            </form>
          )}
          <p className="text-xs text-neutral-500">Le PIN reste uniquement sur ce téléphone (il n'est jamais envoyé en ligne). Il ne remplace pas votre mot de passe : si vous l'oubliez, déconnectez-vous et reconnectez-vous avec votre mot de passe.</p>
        </div>

        <div className="card space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3"><Icon name="fingerprint" size={28} className="text-gold-600" /><div><div className="font-medium">Empreinte / visage</div><div className="text-sm text-neutral-500">{bio ? 'Activé' : bioOk ? 'Utilise le verrouillage de votre téléphone' : 'Non disponible sur cet appareil'}</div></div></div>
            <button className={bio ? 'btn-ghost' : 'btn-gold'} disabled={!pin || (!bio && !bioOk)} onClick={toggleBio}>{bio ? 'Désactiver' : 'Activer'}</button>
          </div>
          {!pin && <Notice>Créez d'abord un PIN : il sert de secours si l'empreinte n'est pas reconnue.</Notice>}
          {msg && <Notice tone="red">{msg}</Notice>}
          <p className="text-xs text-neutral-500">Fonctionne avec l'empreinte ou le visage déjà enregistrés dans votre téléphone (Chrome Android, iPhone, Windows Hello). L'application ne reçoit jamais votre empreinte.</p>
        </div>

        <div className="card space-y-3">
          <div className="font-medium">Verrouillage automatique</div>
          <Select label="Verrouiller" value={String(o.minutes)} onChange={(v) => setO({ minutes: Number(v) })} options={LOCK_CHOICES.map(([v, l]) => ({ value: String(v), label: l }))} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={o.onOpen} onChange={(e) => setO({ onOpen: e.target.checked })} />Demander le PIN à chaque ouverture de l'application</label>
          <button className="btn-primary w-full" disabled={!pin} onClick={() => window.dispatchEvent(new Event('tb-lock-now'))}><Icon name="lock" size={16} />Verrouiller maintenant</button>
          {!pin && <p className="text-xs text-neutral-500">Le verrouillage ne s'active qu'après la création d'un PIN.</p>}
        </div>
      </div>
    </>
  )
}
