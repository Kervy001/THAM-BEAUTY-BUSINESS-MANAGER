import { useState } from 'react'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { db, withSecondaryAuth } from '../lib/firebase.js'
import { useApp } from '../lib/store.jsx'
import { PERMS, ROLES } from '../lib/perms.js'
import { fdt, nowIso } from '../lib/util.js'
import { Badge, Empty, Input, Modal, Notice, NumberInput, PageHeader, Select, Table, Tabs, Textarea } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { receiptLogo } from '../components/Logo.jsx'

export default function Admin() {
  const app = useApp()
  const [tab, setTab] = useState(app.can('users.manage') ? 'Utilisateurs' : 'Réglages')
  const tabs = [...(app.can('users.manage') ? ['Utilisateurs'] : []), ...(app.can('settings.manage') ? ['Réglages'] : []), 'Historique']
  return (
    <>
      <PageHeader title="Utilisateurs & réglages" />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'Utilisateurs' && <Users />}
      {tab === 'Réglages' && <Settings />}
      {tab === 'Historique' && <Audit />}
    </>
  )
}

function Users() {
  const app = useApp()
  const [edit, setEdit] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (!edit.id && !navigator.onLine) return setErr('Connexion Internet requise pour créer un utilisateur.')
    setBusy(true)
    try {
      if (edit.id) {
        await app.write(setDoc(doc(db, 'users', edit.id), { name: edit.name, role: edit.role, perms: edit.perms, active: edit.active !== false, updatedAt: nowIso() }, { merge: true }))
        app.logAudit('modification utilisateur', 'users', edit.id, edit.email)
      } else {
        const uidNew = await withSecondaryAuth(async (a2) => (await createUserWithEmailAndPassword(a2, edit.email.trim(), edit.password)).user.uid)
        await app.write(setDoc(doc(db, 'users', uidNew), { name: edit.name, email: edit.email.trim(), role: edit.role, perms: edit.perms, active: true, createdAt: nowIso(), createdBy: app.profile.name }))
        app.logAudit('création utilisateur', 'users', uidNew, edit.email)
      }
      setEdit(null)
    } catch (ex) { setErr(ex.code === 'auth/email-already-in-use' ? 'Adresse déjà utilisée.' : ex.code === 'auth/weak-password' ? 'Mot de passe trop court (6 caractères minimum).' : ex.message) } finally { setBusy(false) }
  }
  const togglePerm = (k) => setEdit({ ...edit, perms: edit.perms.includes(k) ? edit.perms.filter((x) => x !== k) : [...edit.perms, k] })
  const setRole = (role) => setEdit({ ...edit, role, perms: [...ROLES[role].perms] })

  return (
    <>
      <div className="mb-3 flex justify-end"><button className="btn-gold" onClick={() => setEdit({ name: '', email: '', password: '', role: 'commercial', perms: [...ROLES.commercial.perms] })}>+ Utilisateur</button></div>
      <div className="card !p-2">
        <Table head={['Nom', 'E-mail', 'Rôle', 'Statut', '']}>
          {app.D.users.map((u) => (
            <tr key={u.id}><td className="td font-medium">{u.name}</td><td className="td">{u.email}</td><td className="td">{ROLES[u.role]?.label || u.role}</td>
              <td className="td">{u.active === false ? <Badge tone="red">Désactivé</Badge> : <Badge tone="green">Actif</Badge>}</td>
              <td className="td"><button className="btn-ghost btn-sm" onClick={() => setEdit({ ...u, perms: u.perms || [] })}>Modifier</button></td></tr>
          ))}
        </Table>
      </div>
      <p className="mt-2 text-xs text-neutral-500">Le mot de passe d'un utilisateur existant se change via « Mot de passe oublié » sur l'écran de connexion (un e-mail est envoyé).</p>
      {edit && (
        <Modal wide title={edit.id ? "Modifier l'utilisateur" : 'Nouvel utilisateur'} onClose={() => setEdit(null)}>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Nom" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
              <Input label="E-mail" type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} required disabled={!!edit.id} />
              {!edit.id && <Input label="Mot de passe initial" type="text" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} required minLength={6} />}
              <Select label="Rôle (préréglage des autorisations)" value={edit.role} onChange={setRole} options={Object.entries(ROLES).map(([value, r]) => ({ value, label: r.label }))} />
              {edit.id && edit.id !== app.authUser.uid && <Select label="Compte" value={edit.active === false ? 'non' : 'oui'} onChange={(v) => setEdit({ ...edit, active: v === 'oui' })} options={[{ value: 'oui', label: 'Actif' }, { value: 'non', label: 'Désactivé' }]} />}
            </div>
            <div className="rounded-lg border p-3"><div className="mb-2 text-sm font-medium">Autorisations (modifiables)</div>
              <div className="grid gap-1 sm:grid-cols-2">{Object.entries(PERMS).map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.role === 'admin' || edit.perms.includes(k)} disabled={edit.role === 'admin'} onChange={() => togglePerm(k)} />{l}</label>)}</div></div>
            {err && <div className="text-sm text-red-600">{err}</div>}
            <button className="btn-primary w-full" disabled={busy}>{busy ? '…' : 'Enregistrer'}</button>
          </form>
        </Modal>
      )}
    </>
  )
}

// Réduit une image choisie (logo) pour la stocker dans les réglages (< ~300 Ko)
function fileToLogo(file, max = 360) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onerror = () => reject(new Error('Lecture du fichier impossible.'))
    fr.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error("Ce fichier n'est pas une image valide."))
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        const png = file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/svg+xml'
        let out = png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.88)
        if (out.length > 380000) out = c.toDataURL('image/jpeg', 0.8)
        resolve(out)
      }
      img.src = fr.result
    }
    fr.readAsDataURL(file)
  })
}

function Settings() {
  const app = useApp()
  const [s, setS] = useState({ ...app.settings, expenseText: (app.settings.expenseCategories || []).join('\n') })
  const [ok, setOk] = useState(false)
  const [logoErr, setLogoErr] = useState('')
  async function submit(e) {
    e.preventDefault()
    const { expenseText, ...rest } = s
    await app.saveSettings({ ...rest, discountUsual: Number(s.discountUsual), discountWarn: Number(s.discountWarn), discountAuth: Number(s.discountAuth), lowStock: Number(s.lowStock), expenseCategories: expenseText.split('\n').map((x) => x.trim()).filter(Boolean) }, 'modification réglages')
    setOk(true); setTimeout(() => setOk(false), 2500)
  }
  async function pickLogo(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setLogoErr('')
    try { setS({ ...s, logo: await fileToLogo(f) }) } catch (ex) { setLogoErr(ex.message) }
  }
  const co = (k) => (e) => setS({ ...s, company: { ...s.company, [k]: e.target.value } })
  const rc = (k, v) => setS({ ...s, receipt: { ...s.receipt, [k]: v } })
  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="card space-y-4">
        <div className="font-display text-base font-semibold">Logo & documents (factures, reçus)</div>
        <div className="flex flex-wrap items-center gap-5">
          <div className="grid h-32 w-32 shrink-0 place-items-center rounded-2xl p-2 ring-1 ring-line" style={{ backgroundImage: 'linear-gradient(45deg,#eee 25%,transparent 25%,transparent 75%,#eee 75%),linear-gradient(45deg,#eee 25%,#fff 25%,#fff 75%,#eee 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0,8px 8px' }}>
            <img src={receiptLogo(s)} alt="Logo" className="max-h-full max-w-full object-contain" />
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <label className="btn-primary cursor-pointer"><Icon name="upload" size={16} />Changer le logo<input type="file" accept="image/*" className="hidden" onChange={pickLogo} /></label>
              {s.logo && <button type="button" className="btn-ghost" onClick={() => setS({ ...s, logo: '' })}>Revenir au logo THAM</button>}
            </div>
            <p className="max-w-sm text-xs text-neutral-500">PNG à fond transparent conseillé (ou JPG). Pour du papier blanc, utilisez une version claire du logo pour économiser l'encre. N'oubliez pas d'enregistrer.</p>
            {logoErr && <div className="text-sm text-blush-600">{logoErr}</div>}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Logo sur les documents" value={s.receipt.showLogo ? 'oui' : 'non'} onChange={(v) => rc('showLogo', v === 'oui')} options={[{ value: 'oui', label: 'Afficher' }, { value: 'non', label: 'Masquer' }]} />
          <NumberInput label="Largeur du logo (px)" value={s.receipt.logoWidth} onChange={(v) => rc('logoWidth', Math.max(30, Math.min(260, Number(v) || 90)))} />
          <Select label="Format d'impression par défaut" value={s.receipt.format} onChange={(v) => rc('format', v)} options={[{ value: 'a4', label: 'A4' }, { value: 'ticket', label: 'Ticket 80 mm' }]} />
        </div>
      </div>
      <div className="card grid gap-3 sm:grid-cols-2">
        <div className="font-display text-base font-semibold sm:col-span-2">Entreprise (documents)</div>
        <Input label="Nom" value={s.company.name} onChange={co('name')} />
        <Input label="Téléphone" value={s.company.phone} onChange={co('phone')} />
        <Input label="Adresse" value={s.company.address} onChange={co('address')} />
        <Input label="Pied de page des factures" value={s.company.footer} onChange={co('footer')} />
      </div>
      <div className="card grid gap-3 sm:grid-cols-2">
        <div className="font-display text-base font-semibold sm:col-span-2">Devise et réductions</div>
        <Select label="Devise de référence des rapports" value={s.refCurrency} onChange={(v) => setS({ ...s, refCurrency: v })} options={['USD', 'HTG']} />
        <NumberInput label="Seuil de stock faible (quantité)" value={s.lowStock} onChange={(v) => setS({ ...s, lowStock: v })} />
        <NumberInput label="Réduction habituelle (%)" value={s.discountUsual} onChange={(v) => setS({ ...s, discountUsual: v })} />
        <NumberInput label="Avertissement à partir de (%)" value={s.discountWarn} onChange={(v) => setS({ ...s, discountWarn: v })} />
        <NumberInput label="Autorisation requise à partir de (%)" value={s.discountAuth} onChange={(v) => setS({ ...s, discountAuth: v })} hint="Au-delà, seuls les utilisateurs avec « Autoriser les grosses réductions » peuvent valider." />
      </div>
      <div className="card"><Textarea label="Catégories de dépenses de projet (une par ligne)" rows={8} value={s.expenseText} onChange={(e) => setS({ ...s, expenseText: e.target.value })} /></div>
      <div className="flex items-center gap-3"><button className="btn-gold">Enregistrer</button>{ok && <span className="text-sm font-medium text-emerald-700">Enregistré ✓</span>}</div>
    </form>
  )
}

function Audit() {
  const app = useApp()
  if (!app.audit.length) return <Empty>Aucune action enregistrée (ou accès non autorisé).</Empty>
  return (
    <div className="card !p-2"><Table head={['Date', 'Utilisateur', 'Action', 'Détail']}>
      {app.audit.map((a) => <tr key={a.id}><td className="td whitespace-nowrap">{fdt(a.at)}</td><td className="td">{a.userName}</td><td className="td">{a.action}</td><td className="td text-xs text-neutral-500">{a.entity} {a.detail}</td></tr>)}
    </Table></div>
  )
}
