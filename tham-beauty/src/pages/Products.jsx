import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../lib/store.jsx'
import { money, uid } from '../lib/util.js'
import { lookupCode, makeCode, normCode } from '../lib/codes.js'
import Scanner from '../components/Scanner.jsx'
import Icon from '../components/Icon.jsx'
import { Badge, Empty, Input, Modal, NumberInput, PageHeader, Select, Table, Textarea } from '../components/ui.jsx'

const blank = () => ({ kind: 'general', name: '', sku: '', barcode: '', category: '', brand: '', description: '', photo: '', supplierId: '', unit: 'pièce', active: true, variants: [] })
const blankVar = () => ({ id: uid(), label: '', sku: '', barcode: '', color: '', size: '', detail: '', texture: '', density: '', material: '', closure: '', price: '', priceCurrency: 'USD', active: true })
// Type d'attributs des variantes : « cheveux » (texture, densité, fermeture) ou « général » (taille, détail libre).
// Les anciens produits sont reconnus automatiquement pour ne perdre aucune information.
const HAIR_WORDS = /perruq|lace|extension|cheveu|bundle|frontal|closure|wig|tissage/i
const inferKind = (p) => p.kind || (((p.variants || []).some((v) => v.texture || v.density || v.closure) || HAIR_WORDS.test(`${p.name} ${p.category || ''}`)) ? 'cheveux' : 'general')

export default function Products() {
  const app = useApp()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const [gen, setGen] = useState('')
  const [scanFor, setScanFor] = useState(null) // 'search' | 'product' | index de variante
  const [params, setParams] = useSearchParams()
  const canEdit = app.can('products.write')
  // Lien depuis le scanner du stock : /produits?newcode=XXXX → nouveau produit avec ce code
  useEffect(() => {
    const c = params.get('newcode')
    if (c && canEdit) { setEdit({ ...blank(), barcode: c }); setParams({}, { replace: true }) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const list = app.D.products.filter((p) => (p.name + (p.sku || '') + (p.barcode || '') + (p.category || '') + (p.variants || []).map((v) => v.sku + (v.barcode || '') + v.label).join(' ')).toLowerCase().includes(q.toLowerCase()))
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
    const codeUsed = (code, selfP, selfV) => app.D.products.some((x) => (x.id !== selfP && (normCode(x.sku) === normCode(code) || normCode(x.barcode) === normCode(code))) ||
      (x.variants || []).some((y) => y.id !== selfV && (normCode(y.sku) === normCode(code) || normCode(y.barcode) === normCode(code))))
    if (p.barcode && codeUsed(p.barcode, p.id, null)) return alert(`Code-barres déjà utilisé : ${p.barcode}`)
    const seenB = new Set()
    for (const v of p.variants) {
      if (v.barcode) {
        if (seenB.has(normCode(v.barcode)) || codeUsed(v.barcode, p.id, v.id)) return alert(`Code-barres de variante déjà utilisé : ${v.barcode}`)
        seenB.add(normCode(v.barcode))
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
    const vs = parts.map((p) => ({ ...blankVar(), label: edit.kind === 'cheveux' && /^\d+$/.test(p) ? `${p} pouces` : p, sku: `${base}-${p.replace(/\s/g, '').toUpperCase()}` }))
    setEdit({ ...edit, variants: [...edit.variants, ...vs] })
    setGen('')
  }

  return (
    <>
      <PageHeader title="Produits & variantes">
        <Link to="/etiquettes" className="btn-ghost"><Icon name="printer" size={16} />Étiquettes</Link>
        {canEdit && <button className="btn-primary" onClick={() => setEdit(blank())}>+ Produit</button>}
      </PageHeader>
      <div className="mb-3 flex gap-2">
        <input className="input" placeholder="Rechercher (nom, SKU, code-barres, catégorie)…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn-gold shrink-0" onClick={() => setScanFor('search')} aria-label="Scanner"><Icon name="scan" size={18} />Scanner</button>
      </div>
      {!list.length ? <Empty>Aucun produit. Ajoutez n'importe quel article à vendre : par exemple « Lace Frontal » (10 à 20 pouces), « Parfum Rose » (30 ml, 50 ml) ou « T-shirt » (S, M, L).</Empty> : (
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
                  <Link to={`/etiquettes?p=${p.id}`} className="btn-ghost btn-sm" aria-label="Étiquettes"><Icon name="printer" size={14} /></Link>
                  {canEdit && <button className="btn-ghost btn-sm" onClick={() => setEdit({ ...blank(), ...p, kind: inferKind(p), variants: p.variants || [] })}>Modifier</button>}
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
              <div>
                <Input label="Code-barres / QR (facultatif)" value={edit.barcode || ''} onChange={(e) => setEdit({ ...edit, barcode: e.target.value.trim() })} hint="Vide = le SKU sert de code. Scannez un code existant ou générez-en un." />
                <div className="mt-1.5 flex gap-2"><button type="button" className="btn-ghost btn-sm" onClick={() => setScanFor('product')}><Icon name="scan" size={14} />Scanner</button><button type="button" className="btn-ghost btn-sm" onClick={() => setEdit({ ...edit, barcode: makeCode() })}>Générer</button></div>
              </div>
              <Input label="Catégorie" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} placeholder="Perruque, Parfum, Soin visage, Vêtement, Accessoire…" />
              <Input label="Marque" value={edit.brand} onChange={(e) => setEdit({ ...edit, brand: e.target.value })} />
              <Select label="Fournisseur habituel" value={edit.supplierId} onChange={(v) => setEdit({ ...edit, supplierId: v })} placeholder="—" options={app.D.suppliers.map((s) => ({ value: s.id, label: s.name }))} />
              <Input label="Unité de mesure" value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} placeholder="pièce, boîte, flacon, kg…" />
              <Input label="Photo (lien, facultatif)" value={edit.photo} onChange={(e) => setEdit({ ...edit, photo: e.target.value })} />
              <Select label="Type de produit" value={edit.kind || 'general'} onChange={(v) => setEdit({ ...edit, kind: v })} options={[{ value: 'general', label: 'Général (parfum, soins, vêtements, accessoires…)' }, { value: 'cheveux', label: 'Cheveux & perruques' }]} />
              <Select label="Statut" value={edit.active === false ? 'non' : 'oui'} onChange={(v) => setEdit({ ...edit, active: v === 'oui' })} options={[{ value: 'oui', label: 'Actif' }, { value: 'non', label: 'Inactif' }]} />
            </div>
            <Textarea label="Description" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            <div className="rounded-xl border border-neutral-200 p-3">
              <div className="mb-2 flex flex-wrap items-end gap-2">
                <div className="font-medium">Variantes</div>
                <input className="input !w-56" placeholder={edit.kind === 'cheveux' ? 'Générer : 10, 12, 14, 16' : 'Générer : 30 ml, 50 ml, 100 ml'} value={gen} onChange={(e) => setGen(e.target.value)} />
                <button type="button" className="btn-ghost btn-sm" onClick={generate}>Générer</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setEdit({ ...edit, variants: [...edit.variants, blankVar()] })}>+ Variante</button>
              </div>
              <div className="space-y-3">
                {edit.variants.map((v, i) => (
                  <div key={v.id} className="rounded-lg bg-neutral-50 p-2">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Input label="Libellé" value={v.label} onChange={(e) => setV(i, 'label', e.target.value)} required placeholder={edit.kind === 'cheveux' ? '12 pouces' : '50 ml, Rouge, XL…'} />
                      <Input label="SKU" value={v.sku} onChange={(e) => setV(i, 'sku', e.target.value.trim())} />
                      <div>
                        <Input label="Code-barres / QR" value={v.barcode || ''} onChange={(e) => setV(i, 'barcode', e.target.value.trim())} />
                        <div className="mt-1 flex gap-1.5"><button type="button" className="text-xs underline" onClick={() => setScanFor(i)}>Scanner</button><button type="button" className="text-xs underline" onClick={() => setV(i, 'barcode', makeCode())}>Générer</button></div>
                      </div>
                      <NumberInput label="Prix habituel" value={v.price} onChange={(x) => setV(i, 'price', x)} />
                      <Select label="Devise" value={v.priceCurrency} onChange={(x) => setV(i, 'priceCurrency', x)} options={['USD', 'HTG']} />
                      <Input label="Couleur" value={v.color} onChange={(e) => setV(i, 'color', e.target.value)} />
                      {edit.kind === 'cheveux' ? (
                        <>
                          <Input label="Texture" value={v.texture} onChange={(e) => setV(i, 'texture', e.target.value)} />
                          <Input label="Densité" value={v.density} onChange={(e) => setV(i, 'density', e.target.value)} />
                          <Input label="Matière" value={v.material} onChange={(e) => setV(i, 'material', e.target.value)} />
                          <Input label="Fermeture" value={v.closure} onChange={(e) => setV(i, 'closure', e.target.value)} />
                        </>
                      ) : (
                        <>
                          <Input label="Taille / contenance" value={v.size || ''} onChange={(e) => setV(i, 'size', e.target.value)} placeholder="M, 50 ml, 1 kg…" />
                          <Input label="Matière" value={v.material} onChange={(e) => setV(i, 'material', e.target.value)} />
                          <Input label="Autre détail" value={v.detail || ''} onChange={(e) => setV(i, 'detail', e.target.value)} placeholder="Parfum, modèle, référence…" />
                        </>
                      )}
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
      {scanFor !== null && (
        <Scanner title="Scanner un code" onClose={() => setScanFor(null)} onDetect={(code) => {
          if (scanFor === 'search') {
            setQ(code)
            const f = lookupCode(code, app.D.products)
            return f ? { ok: true, text: `Trouvé : ${f.product.name}${f.variant ? ' — ' + f.variant.label : ''}` } : { ok: false, text: `Code inconnu : ${code}` }
          }
          if (scanFor === 'product') setEdit((e) => ({ ...e, barcode: code }))
          else setEdit((e) => ({ ...e, variants: e.variants.map((v, j) => (j === scanFor ? { ...v, barcode: code } : v)) }))
          return { ok: true, text: `Code enregistré : ${code}` }
        }} />
      )}
    </>
  )
}
