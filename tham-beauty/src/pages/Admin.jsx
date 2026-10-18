import { useState } from 'react'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { db, withSecondaryAuth } from '../lib/firebase.js'
import { useApp } from '../lib/store.jsx'
import { PERMS, ROLES } from '../lib/perms.js'
import { fdt, nowIso, today, uid as newId } from '../lib/util.js'
import { LOCK_CHOICES } from '../lib/security.js'
import { Badge, Empty, Input, Modal, Notice, NumberInput, PageHeader, PasswordConfirm, Select, Table, Tabs, Textarea } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { receiptLogo } from '../components/Logo.jsx'

export default function Admin() {
  const app = useApp()
  const [tab, setTab] = useState(app.can('users.manage') ? 'Utilisateurs' : 'Réglages')
  const tabs = [...(app.can('users.manage') ? ['Utilisateurs'] : []), ...(app.can('settings.manage') ? ['Réglages'] : []), ...(app.isAdmin ? ['Sauvegarde'] : []), 'Historique']
  return (
    <>
      <PageHeader title="Utilisateurs & réglages" />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'Utilisateurs' && <Users />}
      {tab === 'Réglages' && <Settings />}
      {tab === 'Sauvegarde' && app.isAdmin && <Backup />}
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
        await app.write(setDoc(doc(db, 'users', edit.id), { name: edit.name, role: edit.role, perms: edit.perms, active: edit.active !== false, locationId: edit.locationId || '', updatedAt: nowIso() }, { merge: true }))
        app.logAudit('modification utilisateur', 'users', edit.id, edit.email)
      } else {
        const uidNew = await withSecondaryAuth(async (a2) => (await createUserWithEmailAndPassword(a2, edit.email.trim(), edit.password)).user.uid)
        await app.write(setDoc(doc(db, 'users', uidNew), { name: edit.name, email: edit.email.trim(), role: edit.role, perms: edit.perms, active: true, locationId: edit.locationId || '', createdAt: nowIso(), createdBy: app.profile.name }))
        app.logAudit('création utilisateur', 'users', uidNew, edit.email)
      }
      setEdit(null)
    } catch (ex) { setErr(ex.code === 'auth/email-already-in-use' ? 'Adresse déjà utilisée.' : ex.code === 'auth/weak-password' ? 'Mot de passe trop court (8 caractères minimum).' : ex.message) } finally { setBusy(false) }
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
              {!edit.id && <Input label="Mot de passe initial" type="text" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} required minLength={8} />}
              <Select label="Rôle (préréglage des autorisations)" value={edit.role} onChange={setRole} options={Object.entries(ROLES).map(([value, r]) => ({ value, label: r.label }))} />
              {app.multiLoc && <Select label="Point de vente attitré (facultatif)" value={edit.locationId || ''} onChange={(v) => setEdit({ ...edit, locationId: v })} placeholder="— libre : peut choisir —" options={app.locations.map((l) => ({ value: l.id, label: l.name }))} />}
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
    await app.saveSettings({ ...rest, discountUsual: Number(s.discountUsual), discountWarn: Number(s.discountWarn), discountAuth: Number(s.discountAuth), lowStock: Number(s.lowStock), whatsappCC: String(s.whatsappCC || '509').replace(/\D/g, '') || '509', locations: (s.locations || []).map((l) => ({ ...l, name: (l.name || '').trim() })).filter((l) => l.name), security: { requirePin: !!s.security.requirePin, lockMinutes: Number(s.security.lockMinutes) }, commission: { enabled: !!s.commission.enabled, rate: Number(s.commission.rate) || 0, basis: s.commission.basis, target: Number(s.commission.target) || 0, visibleToSellers: !!s.commission.visibleToSellers }, expenseCategories: expenseText.split('\n').map((x) => x.trim()).filter(Boolean) }, 'modification réglages')
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
  const sec = (k, v) => setS({ ...s, security: { ...s.security, [k]: v } })
  const cm = (k, v) => setS({ ...s, commission: { ...s.commission, [k]: v } })
  const setLoc = (i, name) => setS({ ...s, locations: s.locations.map((l, j) => (j === i ? { ...l, name } : l)) })
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
      <div className="card space-y-3">
        <div className="font-display text-base font-semibold">Boutiques / dépôts</div>
        <p className="text-xs text-neutral-500">Avec un seul lieu, rien ne change. Dès qu'il y en a deux ou plus, le stock se suit par lieu, chaque vente choisit son lieu et vous pouvez transférer du stock d'un lieu à l'autre.</p>
        {s.locations.map((l, i) => (
          <div key={l.id} className="flex gap-2">
            <input className="input" value={l.name} onChange={(e) => setLoc(i, e.target.value)} placeholder="Nom du lieu" />
            {i > 0 && <button type="button" className="btn-ghost shrink-0" onClick={() => setS({ ...s, locations: s.locations.filter((_, j) => j !== i) })} aria-label="Retirer"><Icon name="x" size={16} /></button>}
          </div>
        ))}
        <button type="button" className="btn-ghost" onClick={() => setS({ ...s, locations: [...s.locations, { id: newId(), name: '' }] })}>+ Ajouter un lieu</button>
        <p className="text-xs text-neutral-500">Ne retirez pas un lieu qui contient encore du stock ou des ventes.</p>
      </div>
      <div className="card grid gap-3 sm:grid-cols-2">
        <div className="font-display text-base font-semibold sm:col-span-2">WhatsApp</div>
        <Input label="Indicatif pays (numéros à 8 chiffres)" value={s.whatsappCC || '509'} onChange={(e) => setS({ ...s, whatsappCC: e.target.value })} hint="Haïti = 509. Un numéro tapé « 37 01 23 45 » devient 509 37012345." />
      </div>
      <div className="card grid gap-3 sm:grid-cols-2">
        <div className="font-display text-base font-semibold sm:col-span-2">Sécurité de l'application</div>
        <Select label="PIN obligatoire pour tous" value={s.security.requirePin ? 'oui' : 'non'} onChange={(v) => sec('requirePin', v === 'oui')} options={[{ value: 'non', label: 'Facultatif (chacun choisit)' }, { value: 'oui', label: 'Obligatoire (à créer à la prochaine connexion)' }]} />
        <Select label="Verrouillage automatique par défaut" value={String(s.security.lockMinutes)} onChange={(v) => sec('lockMinutes', Number(v))} options={LOCK_CHOICES.map(([v, l]) => ({ value: String(v), label: l }))} />
        <p className="text-xs text-neutral-500 sm:col-span-2">Chaque utilisateur crée son PIN (et active son empreinte) dans le menu « Sécurité (PIN) ». Le PIN reste sur son téléphone.</p>
      </div>
      <div className="card grid gap-3 sm:grid-cols-2">
        <div className="font-display text-base font-semibold sm:col-span-2">Commissions & objectifs des vendeurs</div>
        <Select label="Calcul des commissions" value={s.commission.enabled ? 'oui' : 'non'} onChange={(v) => cm('enabled', v === 'oui')} options={[{ value: 'non', label: 'Désactivé' }, { value: 'oui', label: 'Activé' }]} />
        <Select label="Base de calcul" value={s.commission.basis} onChange={(v) => cm('basis', v)} options={[{ value: 'ca', label: 'Chiffre d\'affaires net' }, { value: 'profit', label: 'Bénéfice' }]} />
        <NumberInput label="Taux de commission (%)" value={s.commission.rate} onChange={(v) => cm('rate', v)} />
        <NumberInput label={`Objectif mensuel par vendeur (${s.refCurrency})`} value={s.commission.target} onChange={(v) => cm('target', v)} hint="0 = pas d'objectif." />
        <Select label="Visible par les vendeurs ?" value={s.commission.visibleToSellers ? 'oui' : 'non'} onChange={(v) => cm('visibleToSellers', v === 'oui')} options={[{ value: 'non', label: 'Non — seulement moi (administrateur)' }, { value: 'oui', label: 'Oui — chacun voit sa propre commission / son objectif' }]} />
        <p className="text-xs text-neutral-500 sm:col-span-2">Par défaut, personne d'autre que l'administrateur ne voit les commissions. Vous pouvez désactiver ou masquer cette fonction quand vous voulez (par exemple les mois où il n'y a pas de bonus).</p>
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

// Sauvegarde complète (fichier JSON) et restauration par fusion — administrateur seulement
function Backup() {
  const app = useApp()
  const [file, setFile] = useState(null)
  const [msg, setMsg] = useState('')
  const [ask, setAsk] = useState(false)

  function doExport() {
    const data = app.exportAll()
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url; a.download = `tham-beauty-sauvegarde-${today()}.json`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    app.logAudit('sauvegarde exportée', 'settings', 'main')
    setMsg('Sauvegarde téléchargée ✓ Gardez ce fichier en lieu sûr : il contient clients, ventes et chiffres.')
  }
  async function pick(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    setMsg('')
    if (!f) return
    try {
      const json = JSON.parse(await f.text())
      if (json?.app !== 'tham-beauty' || !json.collections) throw new Error('bad')
      setFile({ name: f.name, json, counts: Object.entries(json.collections).map(([k, v]) => [k, v.length]).filter(([, n]) => n > 0) })
    } catch { setFile(null); setMsg('Ce fichier n’est pas une sauvegarde THAM BEAUTY valide.') }
  }
  const counts = app.exportAll().collections
  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="font-display text-base font-semibold">Sauvegarder</div>
        <p className="text-sm text-neutral-600">Télécharge toutes vos données (produits, clients, fournisseurs, projets, dépenses, ventes, inventaires, clôtures de caisse, réglages) dans un fichier. Faites-le régulièrement, par exemple chaque semaine.</p>
        <p className="text-xs text-neutral-500">Actuellement : {['products', 'customers', 'projects', 'sales'].map((k) => `${(counts[k] || []).length} ${{ products: 'produits', customers: 'clients', projects: 'projets', sales: 'ventes' }[k]}`).join(' · ')}</p>
        <button className="btn-gold" onClick={doExport}><Icon name="download" size={16} />Télécharger la sauvegarde</button>
      </div>
      <div className="card space-y-3">
        <div className="font-display text-base font-semibold">Restaurer</div>
        <Notice>La restauration <b>fusionne</b> : elle ajoute les éléments du fichier et remplace ceux qui ont le même identifiant. Elle ne supprime rien. Les utilisateurs (comptes de connexion) ne sont pas restaurés.</Notice>
        <label className="btn-ghost cursor-pointer"><Icon name="upload" size={16} />Choisir un fichier de sauvegarde<input type="file" accept="application/json,.json" className="hidden" onChange={pick} /></label>
        {file && (
          <div className="space-y-2 rounded-xl bg-paper p-3 text-sm ring-1 ring-line">
            <div className="font-medium">{file.name}</div>
            <div className="text-neutral-500">{file.counts.map(([k, n]) => `${n} ${k}`).join(' · ')}{file.json.exportedAt ? ` — exportée le ${fdt(file.json.exportedAt)}` : ''}</div>
            <button className="btn-danger" onClick={() => setAsk(true)}>Restaurer ces données…</button>
          </div>
        )}
      </div>
      {msg && <Notice>{msg}</Notice>}
      {ask && (
        <PasswordConfirm title="Restaurer la sauvegarde ?" confirmLabel="Restaurer" verify={app.verifyPassword}
          onConfirm={async () => { const n = await app.restoreAll(file.json); setMsg(`Restauration terminée : ${n} éléments écrits ✓`) }}
          onClose={() => { setAsk(false); setFile(null) }}>
          <p>Les données du fichier vont être écrites dans l'application (fusion). Les éléments actuels qui portent le même identifiant seront remplacés par ceux du fichier.</p>
        </PasswordConfirm>
      )}
    </div>
  )
}
