import { useState } from 'react'
import { useApp } from '../lib/store.jsx'
import { EL_LABELS, newCustomTemplate, resolveTemplate, templatesOf, labelOpts, tplOf } from '../lib/printing.js'
import { LabelCell } from './LabelSheet.jsx'
import { Modal } from './ui.jsx'

const DEMO = { name: 'Perruque Brésilienne', label: '24 pouces', code: 'TB123456', price: 125.5, cur: 'USD', key: 'demo' }
const SHOW = { barcode: true, qr: true, price: true }
const SWATCHES = ['#ffffff', '#fff9f7', '#fde7ee', '#fdf3d7', '#111111', '#000000', '#d90429', '#d6336c', '#b8862b', '#d4af37', '#1d4ed8', '#047857']
const AL = [['left', 'Gauche'], ['center', 'Milieu'], ['right', 'Droite']]

function ColorPick({ label, value, onChange }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {SWATCHES.map((c) => <button key={c} type="button" aria-label={c} onClick={() => onChange(c)} className={'h-6 w-6 rounded-full ring-1 ring-line ' + (value === c ? 'outline outline-2 outline-offset-1 outline-ink' : '')} style={{ background: c }} />)}
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-line bg-white p-0" aria-label="Autre couleur" />
      </div>
    </div>
  )
}

// Modèles d'étiquettes : choisir (cet appareil / par défaut entreprise), dupliquer, personnaliser (couleurs, éléments, ordre, tailles, alignement)
export default function LabelTemplates({ prefs, onUse, F }) {
  const app = useApp()
  const canTpl = app.can('settings.manage')
  const all = templatesOf(app.settings)
  const cur = resolveTemplate(app.settings, prefs)
  const defId = app.settings.labelTplDefault || 'standard'
  const base = tplOf(app.settings)
  const O0 = labelOpts(app.settings, prefs)
  const [edit, setEdit] = useState(null)
  const [busy, setBusy] = useState(false)
  const customs = all.filter((x) => !x.builtin)
  const save = (list, patch = {}) => app.saveSettings({ labelTemplates: list, ...patch }, 'modèles d’étiquette')
  const setBase = (patch) => app.saveSettings({ labelTpl: { ...base, ...patch } }, 'modèle d’étiquette')
  const w = Math.min(F.w, 100), h = Math.min(F.h, 70)
  const optsFor = (t) => ({ ...O0, tpl: t })

  async function commit() {
    if (!edit.name.trim()) return
    setBusy(true)
    try {
      const t = { ...edit, name: edit.name.trim() }
      const list = customs.some((x) => x.id === t.id) ? customs.map((x) => (x.id === t.id ? t : x)) : [...customs, t]
      await save(list.map(({ builtin, ...r }) => r))
      onUse(t.id)
      setEdit(null)
    } finally { setBusy(false) }
  }
  async function remove(t) {
    if (!window.confirm(`Supprimer le modèle « ${t.name} » ?`)) return
    await save(customs.filter((x) => x.id !== t.id).map(({ builtin, ...r }) => r), defId === t.id ? { labelTplDefault: 'standard' } : {})
    if (prefs.tplId === t.id) onUse('')
  }
  const setEl = (i, patch) => setEdit({ ...edit, els: edit.els.map((e, j) => (j === i ? { ...e, ...patch } : e)) })
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= edit.els.length) return; const els = edit.els.slice(); [els[i], els[j]] = [els[j], els[i]]; setEdit({ ...edit, els }) }
  const setTheme = (k, v) => setEdit({ ...edit, theme: { ...edit.theme, [k]: v } })

  return (
    <div className="space-y-3 rounded-2xl bg-paper p-3 ring-1 ring-line">
      <div>
        <div className="text-sm font-medium">Modèles d’étiquette</div>
        <p className="text-xs text-neutral-500">Choisissez le style utilisé sur cet appareil. {canTpl ? 'Vous pouvez aussi créer vos propres modèles et choisir celui par défaut de l’entreprise.' : 'L’administrateur peut créer des modèles supplémentaires.'}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">Nom de la boutique (affiché sur les étiquettes)</span>
          <input className="input" disabled={!canTpl} placeholder={app.settings.company?.name || 'THAM BEAUTY'} value={base.shopText} onChange={(e) => setBase({ shopText: e.target.value })} /></label>
        <label className="block"><span className="label">Ligne libre (ex. Instagram, téléphone, « Made in… »)</span>
          <input className="input" disabled={!canTpl} value={base.extra} onChange={(e) => setBase({ extra: e.target.value })} /></label>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="text-xs text-neutral-500">Modèle « Standard » :</span>
        <label className="flex items-center gap-1.5"><input type="checkbox" disabled={!canTpl} checked={!!base.shop} onChange={(e) => setBase({ shop: e.target.checked })} />boutique en haut</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" disabled={!canTpl} checked={!!base.date} onChange={(e) => setBase({ date: e.target.checked })} />date</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" disabled={!canTpl} checked={base.codeText !== false} onChange={(e) => setBase({ codeText: e.target.checked })} />code sous le code-barres</label>
      </div>
      <p className="text-[11px] text-neutral-500">Nom de la boutique, ligne libre et date n’apparaissent que sur les étiquettes assez hautes (28 mm et plus). Les modèles « Longueur » ne montrent que le nom et la longueur.</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {all.map((t) => (
          <div key={t.id} className={'rounded-2xl bg-white p-2.5 ring-1 ' + (cur.id === t.id ? 'ring-2 ring-gold-500' : 'ring-line')}>
            <div className="mb-2 flex justify-center rounded-xl bg-neutral-100 p-2"><div style={{ width: '100%', maxWidth: `${Math.min(w * 3.2, 230)}px` }}><LabelCell l={DEMO} show={SHOW} w={w} h={h} o={optsFor(t)} fluid edge /></div></div>
            <div className="flex flex-wrap items-center gap-1.5">
              <b className="text-sm">{t.name}</b>
              {cur.id === t.id && <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-semibold text-gold-700">Utilisé ici</span>}
              {defId === t.id && <span className="rounded-full bg-blush-50 px-2 py-0.5 text-[10px] font-semibold text-blush-600">Par défaut</span>}
            </div>
            {t.desc && <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">{t.desc}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {cur.id !== t.id && <button type="button" className="btn-gold btn-sm" onClick={() => onUse(t.id)}>Utiliser</button>}
              {canTpl && defId !== t.id && <button type="button" className="btn-ghost btn-sm" onClick={() => app.saveSettings({ labelTplDefault: t.id }, 'modèle d’étiquette par défaut')}>Par défaut</button>}
              {canTpl && <button type="button" className="btn-ghost btn-sm" onClick={() => setEdit(newCustomTemplate(t, t.builtin ? `${t.name} (copie)` : `${t.name} (copie)`))}>Dupliquer</button>}
              {canTpl && !t.builtin && <button type="button" className="btn-ghost btn-sm" onClick={() => setEdit({ ...t, theme: { ...t.theme }, els: t.els.map((e) => ({ ...e })) })}>Modifier</button>}
              {canTpl && !t.builtin && <button type="button" className="btn-ghost btn-sm !text-blush-600" onClick={() => remove(t)}>Supprimer</button>}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-neutral-500">Rouge, noir, rose : les couleurs sortent en couleur sur une imprimante couleur ou en PNG/PDF ; une imprimante thermique les imprime en noir et blanc (le modèle « Longueur — noir » y est le plus lisible).</p>

      {edit && (
        <Modal title={customs.some((x) => x.id === edit.id) ? 'Modifier le modèle' : 'Nouveau modèle'} onClose={() => setEdit(null)} wide
          footer={<div className="flex gap-2"><button type="button" className="btn-ghost flex-1" onClick={() => setEdit(null)}>Annuler</button><button type="button" className="btn-primary flex-1" disabled={busy || !edit.name.trim()} onClick={commit}>{busy ? '…' : 'Enregistrer'}</button></div>}>
          <div className="space-y-4">
            <div className="flex justify-center rounded-xl bg-neutral-100 p-3"><div style={{ width: '100%', maxWidth: `${Math.min(w * 5, 380)}px` }}><LabelCell l={DEMO} show={SHOW} w={w} h={h} o={optsFor(edit)} fluid edge /></div></div>
            <label className="block"><span className="label">Nom du modèle</span><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <div className="grid gap-3 sm:grid-cols-3">
              <ColorPick label="Fond" value={edit.theme.bg} onChange={(v) => setTheme('bg', v)} />
              <ColorPick label="Texte" value={edit.theme.fg} onChange={(v) => setTheme('fg', v)} />
              <ColorPick label="Accent (cadre, bandeau, prix)" value={edit.theme.accent} onChange={(v) => setTheme('accent', v)} />
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!edit.theme.frame} onChange={(e) => setTheme('frame', e.target.checked)} />Cadre arrondi</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!edit.theme.band} onChange={(e) => setTheme('band', e.target.checked)} />Bandeau de couleur derrière le nom de la boutique (s’il est en premier)</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!edit.qr} onChange={(e) => setEdit({ ...edit, qr: e.target.checked })} />QR à côté du code-barres (grandes étiquettes)</label>
            </div>
            <div>
              <span className="label">Éléments (de haut en bas) : cochez, ordonnez, taille, alignement</span>
              <div className="divide-y divide-line/70 rounded-xl ring-1 ring-line">
                {edit.els.map((e, i) => (
                  <div key={e.k} className={'flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2.5 py-2 text-sm ' + (e.on ? '' : 'opacity-60')}>
                    <div className="flex flex-col"><button type="button" className="px-1 leading-none text-neutral-500 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter">▲</button><button type="button" className="px-1 leading-none text-neutral-500 disabled:opacity-30" disabled={i === edit.els.length - 1} onClick={() => move(i, 1)} aria-label="Descendre">▼</button></div>
                    <label className="flex min-w-[10rem] items-center gap-1.5 font-medium"><input type="checkbox" checked={!!e.on} onChange={(ev) => setEl(i, { on: ev.target.checked })} />{EL_LABELS[e.k]}</label>
                    <label className="flex items-center gap-1 text-xs text-neutral-600">Taille <input type="number" className="input !w-20 !py-1" min="40" max="500" step="10" value={e.size} onChange={(ev) => setEl(i, { size: ev.target.value === '' ? '' : Number(ev.target.value) })} />%</label>
                    {e.k !== 'barcode' && <div className="flex overflow-hidden rounded-lg ring-1 ring-line">{AL.map(([a, l]) => <button key={a} type="button" onClick={() => setEl(i, { align: a })} className={'px-2 py-1 text-xs ' + (e.align === a ? 'bg-ink text-white' : 'bg-white text-neutral-700')}>{l}</button>)}</div>}
                    {e.k !== 'barcode' && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!e.bold} onChange={(ev) => setEl(i, { bold: ev.target.checked })} />Gras</label>}
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-neutral-500">Taille 100 % = taille normale. Pour une grande longueur : activez « Variante / longueur » à 400 % et désactivez le reste. « Variante » suivie de « Prix » s’affichent sur la même ligne (si alignés à gauche/droite).</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
