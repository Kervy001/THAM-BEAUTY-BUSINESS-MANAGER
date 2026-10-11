import { useState } from 'react'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { db, withSecondaryAuth } from '../lib/firebase.js'
import { useApp } from '../lib/store.jsx'
import { PERMS, ROLES } from '../lib/perms.js'
import { fdt, nowIso } from '../lib/util.js'
import { Badge, Empty, Input, Modal, NumberInput, PageHeader, Select, Table, Textarea } from '../components/ui.jsx'

export default function Admin() {
  const app = useApp()
  const [tab, setTab] = useState(app.can('users.manage') ? 'Utilisateurs' : 'Réglages')
  const tabs = [...(app.can('users.manage') ? ['Utilisateurs'] : []), ...(app.can('settings.manage') ? ['Réglages'] : []), 'Historique']
  return (
    <>
      <PageHeader title="Utilisateurs & réglages" />
      <div className="mb-4 flex gap-1 border-b">{tabs.map((t) => <button key={t} onClick={() => setTab(t)} className={'px-3 py-2 text-sm ' + (tab === t ? 'border-b-2 border-gold-500 font-medium' : 'text-neutral-500')}>{t}</button>)}</div>
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
    setErr(''); setBusy(true)
    try {
      if (edit.id) {
        await setDoc(doc(db, 'users', edit.id), { name: edit.name, role: edit.role, perms: edit.perms, active: edit.active !== false, updatedAt: nowIso() }, { merge: true })
        app.logAudit('modification utilisateur', 'users', edit.id, edit.email)
      } else {
        const uidNew = await withSecondaryAuth(async (a2) => (await createUserWithEmailAndPassword(a2, edit.email.trim(), edit.password)).user.uid)
        await setDoc(doc(db, 'users', uidNew), { name: edit.name, email: edit.email.trim(), role: edit.role, perms: edit.perms, active: true, createdAt: nowIso(), createdBy: app.profile.name })
        app.logAudit('création utilisateur', 'users', uidNew, edit.email)
      }
      setEdit(null)
    } catch (ex) { setErr(ex.code === 'auth/email-already-in-use' ? 'Adresse déjà utilisée.' : ex.code === 'auth/weak-password' ? 'Mot de passe trop court (6 caractères minimum).' : ex.message) } finally { setBusy(false) }
  }
  const togglePerm = (k) => setEdit({ ...edit, perms: edit.perms.includes(k) ? edit.perms.filter((x) => x !== k) : [...edit.perms, k] })
  const setRole = (role) => setEdit({ ...edit, role, perms: [...ROLES[role].perms] })

  return (
    <>
      <div className="mb-3 flex justify-end"><button className="btn-primary" onClick={() => setEdit({ name: '', email: '', password: '', role: 'commercial', perms: [...ROLES.commercial.perms] })}>+ Utilisateur</button></div>
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

function Settings() {
  const app = useApp()
  const [s, setS] = useState({ ...app.settings, expenseText: (app.settings.expenseCategories || []).join('\n') })
  const [ok, setOk] = useState(false)
  async function submit(e) {
    e.preventDefault()
    const { expenseText, ...rest } = s
    await setDoc(doc(db, 'settings', 'main'), { ...rest, discountUsual: Number(s.discountUsual), discountWarn: Number(s.discountWarn), discountAuth: Number(s.discountAuth), lowStock: Number(s.lowStock), expenseCategories: expenseText.split('\n').map((x) => x.trim()).filter(Boolean) }, { merge: true })
    app.logAudit('modification réglages', 'settings', 'main')
    setOk(true); setTimeout(() => setOk(false), 2500)
  }
  const co = (k) => (e) => setS({ ...s, company: { ...s.company, [k]: e.target.value } })
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="card grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2 font-medium">Entreprise (documents)</div>
        <Input label="Nom" value={s.company.name} onChange={co('name')} />
        <Input label="Téléphone" value={s.company.phone} onChange={co('phone')} />
        <Input label="Adresse" value={s.company.address} onChange={co('address')} />
        <Input label="Pied de page des factures" value={s.company.footer} onChange={co('footer')} />
      </div>
      <div className="card grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2 font-medium">Devise et réductions</div>
        <Select label="Devise de référence des rapports" value={s.refCurrency} onChange={(v) => setS({ ...s, refCurrency: v })} options={['USD', 'HTG']} />
        <NumberInput label="Seuil de stock faible (quantité)" value={s.lowStock} onChange={(v) => setS({ ...s, lowStock: v })} />
        <NumberInput label="Réduction habituelle (%)" value={s.discountUsual} onChange={(v) => setS({ ...s, discountUsual: v })} />
        <NumberInput label="Avertissement à partir de (%)" value={s.discountWarn} onChange={(v) => setS({ ...s, discountWarn: v })} />
        <NumberInput label="Autorisation requise à partir de (%)" value={s.discountAuth} onChange={(v) => setS({ ...s, discountAuth: v })} hint="Au-delà, seuls les utilisateurs avec « Autoriser les grosses réductions » peuvent valider." />
      </div>
      <div className="card"><Textarea label="Catégories de dépenses de projet (une par ligne)" rows={8} value={s.expenseText} onChange={(e) => setS({ ...s, expenseText: e.target.value })} /></div>
      <div className="flex items-center gap-3"><button className="btn-primary">Enregistrer</button>{ok && <span className="text-sm text-emerald-700">Enregistré ✓</span>}</div>
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
