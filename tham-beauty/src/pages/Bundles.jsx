import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteDoc, doc } from 'firebase/firestore'
import { db } from '../lib/firebase.js'
import { useApp } from '../lib/store.jsx'
import { BUNDLE_STATUS, bundleCandidates, simulateBundle, suggestBundle } from '../lib/bundles.js'
import { round2 } from '../lib/calc.js'
import { money, today } from '../lib/util.js'
import { Badge, Empty, Input, Ledger, Notice, NumberInput, PageHeader, Row, Select, Table, Textarea } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'

const tone = (s) => ({ brouillon: 'gray', envoye: 'blue', accepte: 'amber', vendu: 'green', annule: 'red' }[s] || 'gray')
const pctTone = (p, min) => (p < 0 ? 'bad' : p < min ? undefined : 'good')

// ---------- Liste des boîtes ----------
export function Bundles() {
  const app = useApp()
  const showCost = app.can('finance.read')
  const [q, setQ] = useState('')
  const [st, setSt] = useState('')
  const rows = useMemo(() => app.D.bundles
    .filter((b) => (!st || b.status === st) && ((b.number || '') + (b.name || '') + (b.customerName || '')).toLowerCase().includes(q.toLowerCase()))
    .map((b) => {
      const cands = bundleCandidates(app.D, app.costing, { currency: b.currency, rate: app.rate, ref: app.ref })
      return { b, sim: simulateBundle(b.lines || [], cands, b.price, b.minMargin || 0) }
    })
    .sort((a, b) => (b.b.createdAt || '').localeCompare(a.b.createdAt || '')), [app.D, app.costing, app.rate, app.ref, q, st])

  return (
    <>
      <PageHeader title="Boîtes (vente en gros)" subtitle="Préparez des offres en gros et voyez le bénéfice AVANT de vendre. Une boîte est un brouillon : elle ne change ni le stock ni le chiffre d’affaires.">
        <Link to="/boites/nouvelle" className="btn-primary">+ Nouvelle boîte</Link>
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Rechercher (numéro, nom, client)…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input max-w-[12rem]" value={st} onChange={(e) => setSt(e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(BUNDLE_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {!rows.length ? <Empty icon="package">Aucune boîte pour le moment. Touchez « + Nouvelle boîte » pour préparer une offre en gros.</Empty> : (
        <div className="card !p-0">
          <Table head={['Boîte', 'Client', 'Pièces', 'Prix', ...(showCost ? ['Bénéfice', 'Marge'] : []), 'Statut']}>
            {rows.map(({ b, sim }) => (
              <tr key={b.id} className="hover:bg-paper">
                <td className="td"><Link className="font-medium underline" to={`/boites/${b.id}`}>{b.number}</Link><div className="text-xs text-neutral-500">{b.name}</div></td>
                <td className="td">{b.customerName || '—'}</td>
                <td className="td">{sim.units}</td>
                <td className="td">{money(b.price, b.currency)}</td>
                {showCost && <td className={'td ' + (sim.profit < 0 ? 'text-blush-600' : 'text-emerald-700')}>{money(sim.profit, b.currency)}</td>}
                {showCost && <td className="td">{sim.marginPct} %</td>}
                <td className="td"><Badge tone={tone(b.status)}>{BUNDLE_STATUS[b.status] || b.status}</Badge></td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </>
  )
}

// ---------- Éditeur / simulateur ----------
export function BundleEditor() {
  const app = useApp()
  const nav = useNavigate()
  const { id } = useParams()
  const isNew = id === 'nouvelle'
  const existing = isNew ? null : app.D.bundles.find((b) => b.id === id)
  const showCost = app.can('finance.read')
  const sold = existing?.status === 'vendu'
  const [f, setF] = useState({ name: '', customerId: '', customerName: '', currency: 'USD', price: '', status: 'brouillon', notes: '', minMargin: '30' })
  const [lines, setLines] = useState([])
  const [opt, setOpt] = useState({ maxUnits: '', preferSlow: true, mix: true })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const init = useRef(isNew)
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))

  useEffect(() => {
    if (init.current || !existing) return
    init.current = true
    setF({ name: existing.name || '', customerId: existing.customerId || '', customerName: existing.customerName || '', currency: existing.currency || 'USD', price: String(existing.price ?? ''), status: existing.status || 'brouillon', notes: existing.notes || '', minMargin: String(existing.minMargin ?? 30) })
    setLines((existing.lines || []).map((l) => ({ ...l, qty: String(l.qty) })))
  }, [existing])

  const cands = useMemo(() => bundleCandidates(app.D, app.costing, { currency: f.currency, rate: app.rate, ref: app.ref }), [app.D, app.costing, app.rate, app.ref, f.currency])
  const minMargin = Number(f.minMargin) || 0
  const sim = useMemo(() => simulateBundle(lines, cands, f.price, minMargin), [lines, cands, f.price, minMargin])
  const simRow = Object.fromEntries(sim.rows.map((r) => [r.itemId, r]))
  const minPrice = sim.cost > 0 && minMargin < 100 ? round2(sim.cost / (1 - minMargin / 100)) : 0
  const options = Object.values(cands).filter((c) => !lines.some((l) => l.itemId === c.itemId)).sort((a, b) => a.label.localeCompare(b.label))

  if (!isNew && !existing) return <Empty icon="package">{app.D.bundles.length || init.current ? 'Cette boîte n’existe pas.' : 'Chargement…'} <Link className="underline" to="/boites">Retour</Link></Empty>

  const setQty = (i, v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, qty: v } : l)))
  const addLine = (itemId) => {
    const c = cands[itemId]
    if (!c) return
    setLines((ls) => [...ls, { id: Math.random().toString(36).slice(2, 10), itemId, projectId: c.projectId, label: c.label, sku: c.sku, qty: '1' }])
  }

  function suggest() {
    setErr(''); setMsg('')
    const price = Number(f.price)
    if (!(price > 0)) return setErr('Entrez d’abord le prix de la boîte (ou le budget du client) : la suggestion remplit la boîte jusqu’à ce montant.')
    if (lines.length && !window.confirm('Remplacer la composition actuelle par la suggestion ?')) return
    const s = suggestBundle(cands, { price, minMargin, preferSlow: opt.preferSlow, mix: opt.mix, maxUnits: opt.maxUnits })
    if (!s.length) return setErr('Aucune composition possible : stock vide, coûts inconnus, ou marge minimale trop élevée pour ce prix.')
    setLines(s.map((l) => ({ ...l, id: Math.random().toString(36).slice(2, 10), qty: String(l.qty) })))
    const r = simulateBundle(s, cands, price, minMargin)
    setMsg(`Suggestion : ${r.units} pièces dans ${s.length} article(s)${showCost ? ` — marge ${r.marginPct} %, bénéfice ${money(r.profit, f.currency)}` : ''}. Vous pouvez ajuster les quantités.`)
  }

  const payload = () => {
    const cust = app.D.customers.find((c) => c.id === f.customerId)
    return {
      name: f.name.trim(), customerId: f.customerId, customerName: cust?.name || f.customerName.trim(), currency: f.currency, rate: app.rate,
      price: Number(f.price) || 0, status: f.status, notes: f.notes, minMargin,
      lines: lines.filter((l) => Number(l.qty) > 0).map((l) => ({ id: l.id, itemId: l.itemId, projectId: l.projectId, label: l.label, sku: l.sku || '', qty: Math.floor(Number(l.qty)) }))
    }
  }
  async function save(then) {
    setErr(''); setMsg('')
    if (!f.name.trim()) return setErr('Donnez un nom à la boîte (ex. « Boîte 100 pièces »).')
    if (!(Number(f.price) > 0)) return setErr('Le prix de la boîte est obligatoire.')
    setBusy(true)
    try {
      const p = payload()
      let bid = existing?.id
      if (!bid) p.number = await app.nextNumber('BOX')
      bid = await app.save('bundles', bid || null, bid ? p : { ...p, date: today() }, existing ? 'boîte modifiée' : 'boîte créée')
      if (then === 'sell') return nav(`/ventes/nouvelle?boite=${bid}`)
      if (isNew) return nav(`/boites/${bid}`, { replace: true })
      setMsg('Boîte enregistrée.')
    } catch (ex) { setErr(ex.code === 'permission-denied' ? 'Enregistrement refusé (règles Firebase à publier ?).' : ex.message) } finally { setBusy(false) }
  }
  async function duplicate() {
    setBusy(true); setErr('')
    try {
      const p = { ...payload(), status: 'brouillon', name: (f.name || 'Boîte') + ' (copie)' }
      p.number = await app.nextNumber('BOX')
      const bid = await app.save('bundles', null, { ...p, date: today() }, 'boîte dupliquée')
      nav(`/boites/${bid}`)
    } catch (ex) { setErr(ex.message) } finally { setBusy(false) }
  }
  async function remove() {
    if (!window.confirm('Supprimer cette boîte ? (Les ventes déjà faites ne sont pas touchées.)')) return
    setBusy(true)
    try { await app.write(deleteDoc(doc(db, 'bundles', existing.id))); nav('/boites', { replace: true }) } catch (ex) { setErr(ex.message); setBusy(false) }
  }

  const cur = f.currency
  const blocked = sold
  return (
    <>
      <PageHeader title={isNew ? 'Nouvelle boîte' : `${existing.number} — ${existing.name || ''}`} subtitle={existing && <Badge tone={tone(existing.status)}>{BUNDLE_STATUS[existing.status]}</Badge>}>
        <Link to="/boites" className="btn-ghost">← Boîtes</Link>
      </PageHeader>

      <div className="mb-4"><Notice tone="blue">Simulation basée sur les <b>coûts de revient réels</b> des projets. Elle n’affecte <b>pas</b> le stock, le chiffre d’affaires ni le bénéfice des projets tant que la boîte n’est pas vendue.</Notice></div>
      {sold && <div className="mb-4"><Notice tone="green">Boîte vendue{existing.saleId ? <> — <Link className="font-semibold underline" to={`/ventes/${existing.saleId}`}>voir la vente</Link></> : ''}. Elle n’est plus modifiable.</Notice></div>}

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <section className="card grid gap-3 sm:grid-cols-2">
            <Input label="Nom de la boîte" value={f.name} onChange={(e) => set('name')(e.target.value)} placeholder="ex. Boîte 100 pièces" disabled={blocked} className="sm:col-span-2" />
            <Select label="Client (facultatif)" value={f.customerId} onChange={set('customerId')} placeholder="Client de passage / à définir" options={app.D.customers.map((c) => ({ value: c.id, label: c.name }))} disabled={blocked} />
            {!f.customerId ? <Input label="Nom du client" value={f.customerName} onChange={(e) => set('customerName')(e.target.value)} disabled={blocked} /> : <div />}
            <Select label="Devise" value={f.currency} onChange={set('currency')} options={['USD', 'HTG']} disabled={blocked || lines.length > 0} hint={lines.length ? 'Videz la boîte pour changer de devise.' : undefined} />
            <NumberInput label={`Prix de la boîte (${cur}) — ou budget du client`} value={f.price} onChange={set('price')} disabled={blocked} />
            {!blocked && <Select label="Statut" value={f.status} onChange={set('status')} options={Object.entries(BUNDLE_STATUS).filter(([k]) => k !== 'vendu').map(([value, label]) => ({ value, label }))} />}
            <Textarea label="Notes" value={f.notes} onChange={(e) => set('notes')(e.target.value)} className="sm:col-span-2" rows={2} disabled={blocked} />
          </section>

          {!blocked && (
            <section className="card space-y-3">
              <div className="flex items-center gap-2"><Icon name="trend" size={16} className="text-gold-500" /><h3 className="font-display text-base font-semibold">Suggestion automatique</h3></div>
              <p className="text-xs text-neutral-500">Entrez le prix (ou le budget du client) : l’application remplit la boîte avec le maximum de pièces possible tout en gardant votre marge minimale.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberInput label="Marge minimale (% du prix de vente)" value={f.minMargin} onChange={set('minMargin')} />
                <NumberInput label="Nombre max de pièces (facultatif)" value={opt.maxUnits} onChange={(v) => setOpt({ ...opt, maxUnits: v })} />
              </div>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={opt.preferSlow} onChange={(e) => setOpt({ ...opt, preferSlow: e.target.checked })} /><span>Écouler d’abord le stock <b>qui dort le plus longtemps</b></span></label>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={opt.mix} onChange={(e) => setOpt({ ...opt, mix: e.target.checked })} /><span><b>Mélanger les variétés</b> (longueurs / couleurs) au lieu de vider un seul article</span></label>
              <button type="button" className="btn-gold w-full sm:w-auto" onClick={suggest}>Suggérer une composition</button>
              {msg && <Notice tone="green">{msg}</Notice>}
            </section>
          )}

          <section className="card space-y-3">
            <div className="flex items-center justify-between"><h3 className="font-display text-base font-semibold">Contenu de la boîte</h3><span className="text-xs text-neutral-500">{sim.units} pièce{sim.units > 1 ? 's' : ''}</span></div>
            {!blocked && (
              <Select value="" onChange={addLine} placeholder={options.length ? 'Ajouter un article du stock…' : 'Aucun autre article en stock'} options={options.map((c) => ({ value: c.itemId, label: `${c.label} — ${c.projectNumber} · stock ${c.remaining}${showCost ? ` · coût ${money(c.unitCost, cur)}` : ''}` }))} />
            )}
            {!lines.length ? <Empty icon="package">Boîte vide. Ajoutez des articles ou utilisez la suggestion automatique.</Empty> : (
              <div className="divide-y divide-line/70 rounded-xl ring-1 ring-line">
                {lines.map((l, i) => {
                  const r = simRow[l.itemId]
                  const c = cands[l.itemId]
                  return (
                    <div key={l.id || l.itemId} className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{l.label}</div>
                        <div className="text-[11px] text-neutral-500">{c ? `${c.projectNumber} · stock ${c.remaining}` : 'Plus en stock'}{c && c.ageDays > 0 ? ` · ${c.ageDays} j` : ''}{r && showCost ? ` · coût ${money(r.unitCost, cur)} → prix ${money(r.unitPrice, cur)}` : r ? ` · prix ${money(r.unitPrice, cur)}` : ''}</div>
                        {r && showCost && <div className={'text-[11px] ' + (r.profit < 0 ? 'text-blush-600' : 'text-emerald-700')}>bénéfice {money(r.profit, cur)}</div>}
                      </div>
                      <input className="input !w-20 text-center" type="number" min="0" inputMode="numeric" value={l.qty} disabled={blocked} onChange={(e) => setQty(i, e.target.value)} aria-label="Quantité" />
                      {!blocked && <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-blush-600 hover:bg-blush-50" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Retirer"><Icon name="x" size={16} /></button>}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5 lg:col-span-2">
          <Ledger title="Résultat de la simulation" note={showCost ? 'Coût réel = coût de revient de chaque article (achat + frais répartis des projets). Marge = bénéfice ÷ prix de vente. Majoration = bénéfice ÷ coût.' : undefined}>
            <Row label="Prix de la boîte" value={money(sim.price, cur)} strong />
            <Row label="Pièces" value={sim.units} />
            <Row label="Prix moyen / pièce" value={money(sim.avgPrice, cur)} />
            {showCost && <>
              <Row label="Coût de revient réel" value={money(sim.cost, cur)} />
              <Row label="Coût moyen / pièce" value={money(sim.avgCost, cur)} />
              <Row label="Bénéfice" value={money(sim.profit, cur)} tone={sim.profit < 0 ? 'bad' : sim.profit > 0 ? 'good' : undefined} strong />
              <Row label="Marge (sur le prix)" value={`${sim.marginPct} %`} tone={pctTone(sim.marginPct, minMargin)} />
              <Row label="Majoration (sur le coût)" value={`${sim.markupPct} %`} />
              {minPrice > 0 && <Row label={`Prix minimum pour ${minMargin} % de marge`} value={money(minPrice, cur)} />}
            </>}
          </Ledger>
          {sim.warnings.map((w, i) => <Notice key={i} tone="red">{w}</Notice>)}

          {showCost && sim.perProject.length > 0 && (
            <section className="card !p-0">
              <h3 className="px-4 pb-1 pt-4 font-display text-base font-semibold">Par projet</h3>
              <Table head={['Projet', 'Pcs', 'Coût', 'Part du prix', 'Bénéfice']}>
                {sim.perProject.map((g) => (
                  <tr key={g.projectId}><td className="td"><Link className="underline" to={`/projets/${g.projectId}`}>{g.number}</Link></td><td className="td">{g.units}</td><td className="td">{money(g.cost, cur)}</td><td className="td">{money(g.revenue, cur)}</td><td className={'td ' + (g.profit < 0 ? 'text-blush-600' : 'text-emerald-700')}>{money(g.profit, cur)}</td></tr>
                ))}
              </Table>
            </section>
          )}

          {err && <Notice tone="red">{err}</Notice>}
          <div className="card space-y-2">
            {!blocked && <button className="btn-primary w-full" disabled={busy} onClick={() => save()}>Enregistrer la boîte</button>}
            {!blocked && app.can('sales.write') && <button className="btn-gold w-full" disabled={busy || !sim.units} onClick={() => save('sell')}>Client accepte : convertir en vente réelle</button>}
            {!isNew && <button className="btn-ghost w-full" disabled={busy} onClick={duplicate}>Dupliquer cette boîte</button>}
            {!isNew && !sold && <button className="btn-ghost w-full !text-blush-600" disabled={busy} onClick={remove}>Supprimer</button>}
            <p className="text-[11px] leading-relaxed text-neutral-500">« Convertir » ouvre une nouvelle vente préremplie : le prix de la boîte est réparti sur les articles (proportionnellement à leur prix prévu), le stock est revérifié, puis vous encaissez le paiement. C’est à ce moment que les chiffres deviennent réels.</p>
          </div>
        </aside>
      </div>
    </>
  )
}
