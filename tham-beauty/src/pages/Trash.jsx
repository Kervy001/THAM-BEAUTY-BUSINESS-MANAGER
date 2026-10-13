import { useState } from 'react'
import { useApp, TRASH_DAYS } from '../lib/store.jsx'
import { fdate, money } from '../lib/util.js'
import { saleSummary } from '../lib/calc.js'
import { Badge, Empty, Modal, Notice, PageHeader, PasswordConfirm } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'

const daysLeft = (x) => {
  const end = x.purgeAt ? new Date(x.purgeAt).getTime() : new Date(x.deletedAt).getTime() + TRASH_DAYS * 86400000
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000))
}

function Meta({ x }) {
  const d = daysLeft(x)
  return (
    <div className="mt-0.5 text-xs text-neutral-500">
      Supprimé le {fdate(x.deletedAt)}{x.deletedBy ? ` par ${x.deletedBy}` : ''}{x.deleteReason ? ` — « ${x.deleteReason} »` : ''}
      <span className="ml-2"><Badge tone={d <= 5 ? 'red' : 'amber'}>{d === 0 ? 'Suppression imminente' : `${d} jour${d > 1 ? 's' : ''} restant${d > 1 ? 's' : ''}`}</Badge></span>
    </div>
  )
}

export default function Trash() {
  const app = useApp()
  const { projects, sales } = app.D.trash
  const [dlg, setDlg] = useState(null) // { type: 'purge-project'|'purge-sale', item }
  const empty = !projects.length && !sales.length

  return (
    <>
      <PageHeader title="Corbeille" subtitle={`Les projets et ventes supprimés restent ici ${TRASH_DAYS} jours, puis sont effacés définitivement.`} />
      {empty && <Empty icon="trash">La corbeille est vide.</Empty>}

      {projects.length > 0 && (
        <section className="mb-6">
          <h2 className="section-title">Projets ({projects.length})</h2>
          <div className="space-y-2">
            {projects.map((p) => (
              <div key={p.id} className="card !p-3.5">
                <div className="font-medium">{p.number} — {p.name}</div>
                <Meta x={p} />
                {(p.saleCount > 0 || p.expenseCount > 0) && <div className="mt-1 text-xs text-neutral-500">Contient : {p.saleCount} vente(s) liée(s), {p.expenseCount} dépense(s), {(p.items || []).length} article(s).</div>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-primary btn-sm" onClick={() => app.restoreProject(p).then(() => app.notify('Projet restauré ✓'))}>Restaurer</button>
                  <button className="btn-ghost btn-sm !text-blush-600" onClick={() => setDlg({ type: 'purge-project', item: p })}><Icon name="trash" size={14} />Supprimer définitivement</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {sales.length > 0 && (
        <section className="mb-6">
          <h2 className="section-title">Ventes ({sales.length})</h2>
          <div className="space-y-2">
            {sales.map((x) => {
              const r = saleSummary(x)
              return (
                <div key={x.id} className="card !p-3.5">
                  <div className="font-medium">{x.number} — {x.customerName || 'Client de passage'} <span className="text-sm font-normal text-neutral-500">· {money(r.netKept, x.currency)}</span></div>
                  <Meta x={x} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="btn-primary btn-sm" onClick={() => app.restoreSale(x).then(() => app.notify('Vente restaurée ✓'))}>Restaurer</button>
                    <button className="btn-ghost btn-sm !text-blush-600" onClick={() => setDlg({ type: 'purge-sale', item: x })}><Icon name="trash" size={14} />Supprimer définitivement</button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {!empty && !app.online && <Notice>Hors ligne : la suppression définitive demande une connexion Internet (vérification de votre code).</Notice>}

      {dlg && (
        <PasswordConfirm title="Supprimer définitivement ?" confirmLabel="Supprimer pour toujours" verify={app.verifyPassword}
          onConfirm={() => (dlg.type === 'purge-project' ? app.purgeProject(dlg.item.id, `${dlg.item.number} ${dlg.item.name}`) : app.purgeSale(dlg.item.id, dlg.item.number))}
          onClose={(done) => { setDlg(null); if (done) app.notify('Supprimé définitivement.') }}>
          <p><b>{dlg.item.number}</b> sera effacé <b>pour toujours</b>{dlg.type === 'purge-project' ? ' avec ses dépenses et les ventes qui lui sont liées' : ''}. Cette action est irréversible.</p>
        </PasswordConfirm>
      )}
    </>
  )
}
