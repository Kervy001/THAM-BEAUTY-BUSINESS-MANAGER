import { useState } from 'react'
import { doc, setDoc, addDoc, collection } from 'firebase/firestore'
import { db } from '../lib/firebase.js'
import { useApp } from '../lib/store.jsx'
import { fdt, nowIso } from '../lib/util.js'
import { Empty, Input, NumberInput, PageHeader, Table, Stat } from '../components/ui.jsx'

export default function Rates() {
  const app = useApp()
  const [rate, setRate] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const canEdit = app.can('rates.write')

  async function submit(e) {
    e.preventDefault()
    const nv = Number(rate)
    if (!nv || nv <= 0) return
    setBusy(true)
    try {
      await addDoc(collection(db, 'rateHistory'), { oldRate: app.rate, newRate: nv, at: nowIso(), userId: app.authUser.uid, userName: app.profile.name || app.profile.email, comment })
      await setDoc(doc(db, 'settings', 'main'), { rate: nv }, { merge: true })
      app.logAudit('changement de taux', 'settings', 'main', `${app.rate} → ${nv}`)
      setRate(''); setComment('')
    } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="Taux de change" />
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Stat label="Taux général actuel" value={`1 USD = ${app.rate} HTG`} sub="Proposé par défaut pour les nouvelles opérations. Les opérations passées gardent leur propre taux." />
        {canEdit && (
          <form onSubmit={submit} className="card space-y-3">
            <NumberInput label="Nouveau taux (HTG pour 1 USD)" value={rate} onChange={setRate} required />
            <Input label="Commentaire (facultatif)" value={comment} onChange={(e) => setComment(e.target.value)} />
            <button className="btn-primary w-full" disabled={busy}>Mettre à jour le taux</button>
          </form>
        )}
      </div>
      <h2 className="mb-2 font-semibold">Historique</h2>
      {!app.D.rateHistory.length ? <Empty>Aucune modification enregistrée.</Empty> : (
        <div className="card !p-2">
          <Table head={['Date', 'Ancien', 'Nouveau', 'Utilisateur', 'Commentaire']}>
            {app.D.rateHistory.map((h) => (
              <tr key={h.id}><td className="td">{fdt(h.at)}</td><td className="td">{h.oldRate}</td><td className="td font-medium">{h.newRate}</td><td className="td">{h.userName}</td><td className="td">{h.comment}</td></tr>
            ))}
          </Table>
        </div>
      )}
    </>
  )
}
