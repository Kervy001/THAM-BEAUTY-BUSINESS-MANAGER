import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../lib/store.jsx'
import { money, uid } from '../lib/util.js'
import { Badge, Empty, Input, Modal, NumberInput, PageHeader, Select, Table, Textarea } from '../components/ui.jsx'

const blank = () => ({ name: '', sku: '', category: '', brand: '', description: '', photo: '', supplierId: '', unit: 'pièce', active: true, variants: [] })
const blankVar = () => ({ id: uid(), label: '', sku: '', color: '', texture: '', density: '', material: '', closure: '', price: '', priceCurrency: 'USD', active: true })

export default function Products() {
  const app = useApp()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const [gen, setGen] = useState('')
  const canEdit = app.can('products.write')
  const list = app.D.products.filter((p) => (p.name + (p.sku || '') + (p.category || '') + (p.variants || []).map((v) => v.sku + v.label).join(' ')).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  const skuTaken = (sku, selfProductId, selfVarId) => {
    if (!sku) return false
    return app.D.products.some((p) =>
      (p.id !== selfProductId && p.sku === sku) ||
      (p.variants || []).some((v) => v.sku === sku && v.id !== selfVarId))
  }

  async function submit(e) {
    e.preventDefault()
    const p = edit
    if (skuTaken(p.sku, p.id) && p.sku) return alert('Ce SKU produit existe déjà.')
    const seen = new Set()
    for (const v of p.variants) {
      if (v.sku) {
        if (seen.has(v.sku) || skuTaken(v.sku, p.id, v.id)) return alert(`SKU de variante déjà utilisé : ${v.sku}`)
        seen.add(v.sku)
      }
    }
    const { id, ...v } = p
    v.variants = v.variants.map((x) => ({ ...x, price: x.price === '' ? 0 : Number(x.price) }))
    await app.save('products', id, v, id ? 'modification produit' : 'création produit')
    if (!id) app.notify('Produit enregistré. Pour le vendre, ajoutez-le au stock (bouton « Ajouter au stock »).')
    setEdit(null)
  }
  const setV = (i, k, val) => setEdit({ ...edit, variants: edit.variants.map((v, j) => (j === i ? { ...v, [k]: val } : v)) })

  function generate() {
    const parts = gen.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
    if (!parts.length) return
    const base = edit.sku || edit.name.slice(0, 4).toUpperCase().replace(/\s/g, '')
    const vs = parts.map((p) => ({ ...blankVar(), label: /^\d+$/.test(p) ? `${p} pouces` : p, sku: `${base}-${p.replace(/\s/g, '').toUpperCase()}` }))
    setEdit({ ...edit, variants: [...edit.variants, ...vs] })
    setGen('')
  }

  return (
    <>
      <PageHeader title="Produits & variantes">
        {canEdit && <button className="btn-primary" onClick={() => setEdit(blank())}>+ Produit</button>}
      </PageHeader>
      <input className="input mb-3" placeholder="Rechercher (nom, SKU, catégorie)…" value={q} onChange={(e) => setQ(e.target.value)} />
      {!list.length ? <Empty>Aucun produit. Ajoutez par exemple « Lace Frontal » avec ses variantes de 10 à 20 pouces.</Empty> : (
        <div className="space-y-2">
          {list.map((p) => (
            <div key={p.id} className="card !p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{p.name} {p.active === false && <Badge>Inactif</Badge>}</div>
                  <div className="text-xs text-neutral-500">{[p.sku, p.category, p.brand].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {(app.can('stock.write') || app.can('projects.write')) && p.active !== false && <Link to={`/stock?add=${p.id}`} className="btn-gold btn-sm">Ajouter au stock</Link>}
                  {canEdit && <button className="btn-ghost btn-sm" onClick={() => setEdit({ ...blank(), ...p, variants: p.variants || [] })}>Modifier</button>}
                </div>
              </div>
              {!!(p.variants || []).length && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.variants.map((v) => (
                    <span key={v.id} className="rounded-md bg-neutral-100 px-2 py-1 text-xs">{v.label} <span className="text-neutral-500">{v.sku}</span>{Number(v.price) ? ` · ${money(v.price, v.priceCurrency)}` : ''}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {edit && (
        <Modal wide title={edit.id ? 'Modifier le produit' : 'Nouveau produit'} onClose={() => setEdit(null)}>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Nom" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
              <Input label="SKU produit" value={edit.sku} onChange={(e) => setEdit({ ...edit, sku: e.target.value.trim() })} />
              <Input label="Catégorie" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} placeholder="Perruque, Lace frontal, Extension…" />
              <Input label="Marque" value={edit.brand} onChange={(e) => setEdit({ ...edit, brand: e.target.value })} />
              <Select label="Fournisseur habituel" value={edit.supplierId} onChange={(v) => setEdit({ ...edit, supplierId: v })} placeholder="—" options={app.D.suppliers.map((s) => ({ value: s.id, label: s.name }))} />
              <Input label="Unité de mesure" value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} />
              <Input label="Photo (lien, facultatif)" value={edit.photo} onChange={(e) => setEdit({ ...edit, photo: e.target.value })} />
              <Select label="Statut" value={edit.active === false ? 'non' : 'oui'} onChange={(v) => setEdit({ ...edit, active: v === 'oui' })} options={[{ value: 'oui', label: 'Actif' }, { value: 'non', label: 'Inactif' }]} />
            </div>
            <Textarea label="Description" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            <div className="rounded-xl border border-neutral-200 p-3">
              <div className="mb-2 flex flex-wrap items-end gap-2">
                <div className="font-medium">Variantes</div>
                <input className="input !w-56" placeholder="Générer : 10, 12, 14, 16" value={gen} onChange={(e) => setGen(e.target.value)} />
                <button type="button" className="btn-ghost btn-sm" onClick={generate}>Générer</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setEdit({ ...edit, variants: [...edit.variants, blankVar()] })}>+ Variante</button>
              </div>
              <div className="space-y-3">
                {edit.variants.map((v, i) => (
                  <div key={v.id} className="rounded-lg bg-neutral-50 p-2">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Input label="Libellé" value={v.label} onChange={(e) => setV(i, 'label', e.target.value)} required placeholder="12 pouces" />
                      <Input label="SKU" value={v.sku} onChange={(e) => setV(i, 'sku', e.target.value.trim())} />
                      <NumberInput label="Prix habituel" value={v.price} onChange={(x) => setV(i, 'price', x)} />
                      <Select label="Devise" value={v.priceCurrency} onChange={(x) => setV(i, 'priceCurrency', x)} options={['USD', 'HTG']} />
                      <Input label="Couleur" value={v.color} onChange={(e) => setV(i, 'color', e.target.value)} />
                      <Input label="Texture" value={v.texture} onChange={(e) => setV(i, 'texture', e.target.value)} />
                      <Input label="Densité" value={v.density} onChange={(e) => setV(i, 'density', e.target.value)} />
                      <Input label="Matière" value={v.material} onChange={(e) => setV(i, 'material', e.target.value)} />
                      <Input label="Fermeture" value={v.closure} onChange={(e) => setV(i, 'closure', e.target.value)} />
                    </div>
                    <button type="button" className="mt-1 text-xs text-red-600 underline" onClick={() => setEdit({ ...edit, variants: edit.variants.filter((_, j) => j !== i) })}>Retirer cette variante</button>
                  </div>
                ))}
                {!edit.variants.length && <div className="text-xs text-neutral-500">Sans variante, le produit est vendu tel quel (une seule référence).</div>}
              </div>
            </div>
            <p className="text-xs text-neutral-500">Le prix habituel sert seulement de suggestion. Les prix d'achat et de vente réels se définissent dans chaque projet et chaque vente (l'historique n'est jamais modifié).</p>
            <button className="btn-primary w-full">Enregistrer</button>
          </form>
        </Modal>
      )}
    </>
  )
}
