import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../lib/store.jsx'
import { periodRange } from '../lib/calc.js'
import { KINDS, treasuryReport } from '../lib/treasury.js'
import { fundConfig, fundSummary } from '../lib/fund.js'
import { fdate, money } from '../lib/util.js'
import { Dropdown, Empty, Ledger, MoneyRow, Notice, NumberInput, PageHeader, PrivacyCtx, Table, useMoney, usePrivacy } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { PERIODS } from './Dashboard.jsx'

export default function Treasury() {
  const [hidden, toggle] = usePrivacy()
  return <PrivacyCtx.Provider value={hidden}><TreasuryInner hidden={hidden} toggle={toggle} /></PrivacyCtx.Provider>
}

const IN_KINDS = ['vente', 'depot', 'apport']
const OUT_KINDS = ['depense_generale', 'depense_projet', 'fournisseur', 'remboursement', 'retrait', 'fonds', 'remb_associe', 'distribution']

function TreasuryInner({ hidden, toggle }) {
  const app = useApp()
  const fm = useMoney()
  const ref = app.ref
  const [period, setPeriod] = useState('mois')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const range = useMemo(() => periodRange(period, custom), [period, custom])
  const opening = Number(app.settings?.treasury?.opening) || 0
  const [openDraft, setOpenDraft] = useState(String(opening || ''))
  const T = useMemo(() => treasuryReport(app.D, ref, range, { opening }), [app.D, ref, range, opening])
  const fund = useMemo(() => (app.isAdmin ? fundSummary(app.D, app.costing, ref, fundConfig(app.settings)) : null), [app.isAdmin, app.D, app.costing, ref, app.settings])
  const maxDay = Math.max(1, ...T.byDay.map((d) => Math.max(d.in, d.out)))
  const [kindF, setKindF] = useState('')
  const [more, setMore] = useState(false)
  const endsToday = range[1].getTime() >= Date.now() - 86400000
  const canSetOpening = app.can('settings.manage')

  async function saveOpening() {
    const v = Number(openDraft) || 0
    try { await app.saveSettings({ treasury: { opening: v } }, 'solde d’ouverture de la trésorerie'); app.notify('Solde d’ouverture enregistré.') } catch (ex) { app.notify(ex.message, 'error') }
  }

  // Conseils automatiques, d'après les chiffres
  const tips = []
  if (T.balance < 0) tips.push({ tone: 'red', text: `Le solde estimé à ce jour est négatif (${money(T.balance, ref)}). Vérifiez le solde d’ouverture : c’est l’argent que vous aviez avant d’utiliser l’application.` })
  if (T.overdueCount > 0) tips.push({ tone: 'amber', text: `${T.overdueCount} vente(s) impayée(s) depuis plus de 30 jours, soit ${money(T.overdue, ref)} à relancer.`, to: '/creances', cta: 'Voir les créances' })
  if (T.payables > T.balance + T.receivables && T.payables > 0) tips.push({ tone: 'red', text: 'Vos dettes fournisseurs dépassent votre solde plus vos créances : prévoyez de l’argent avant de commander à nouveau.' })
  else if (T.payables > T.balance && T.payables > 0) tips.push({ tone: 'amber', text: `Vos dettes fournisseurs (${money(T.payables, ref)}) dépassent votre solde actuel : elles dépendent de l’encaissement des créances.` })
  if (T.out > T.in && T.in + T.out > 0) tips.push({ tone: 'amber', text: 'Sur cette période, vous avez dépensé plus que vous n’avez encaissé.' })
  if (fund && fund.available > 0.004) tips.push({ tone: 'green', text: `Le fonds de réinvestissement contient ${money(fund.available, ref)} prêts à être réinvestis.`, to: '/fonds', cta: 'Réinvestir' })
  if (!tips.length) tips.push({ tone: 'green', text: 'Rien d’inquiétant : la trésorerie est saine sur cette période.' })

  const rangeLabel = period === 'tout' ? 'Depuis le début' : `${fdate(range[0])} → ${fdate(range[1])}`
  const kindRows = (keys, dir) => keys.filter((k) => T.byKind[k] > 0.004).map((k) => <MoneyRow key={k} label={KINDS[k]} v={dir * T.byKind[k]} cur={ref} />)

  return (
    <>
      <PageHeader title="Trésorerie" subtitle="Où est passé l’argent : ce qui est entré, ce qui est sorti, ce qu’il vous reste et ce qui arrive." />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Dropdown icon="calendar" value={period} options={PERIODS} onChange={setPeriod} />
        {period === 'perso' && (
          <div className="flex items-center gap-1.5">
            <input type="date" className="input !w-auto !py-2" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            <span className="text-neutral-400">→</span>
            <input type="date" className="input !w-auto !py-2" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          </div>
        )}
        <span className="ml-auto text-xs text-neutral-500">{rangeLabel}</span>
      </div>

      <div className="relative mb-5 overflow-hidden rounded-3xl bg-ink p-5 text-white shadow-pop sm:p-7"
        style={{ backgroundImage: 'radial-gradient(80% 120% at 100% 0%, rgba(201,154,62,.32), transparent 55%), radial-gradient(60% 100% at 0% 100%, rgba(240,86,143,.16), transparent 60%)' }}>
        <button type="button" onClick={toggle} className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full text-gold-300 hover:bg-white/10" aria-label={hidden ? 'Afficher les montants' : 'Masquer les montants'}><Icon name={hidden ? 'eyeoff' : 'eye'} size={21} /></button>
        <div className="text-sm font-medium text-gold-300">Argent disponible sur la période <span className="text-neutral-400">({PERIODS.find((x) => x.value === period)?.label.toLowerCase()})</span></div>
        <div className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl"><span className={T.net >= 0 ? 'gold-text' : 'text-blush-400'}>{fm(T.net, ref)}</span></div>
        <div className="mt-1 text-sm text-neutral-400">entrées {fm(T.in, ref)} − sorties {fm(T.out, ref)} · {rangeLabel}</div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10"><div className="text-xs text-neutral-400">Entrées (période)</div><div className="mt-1 text-lg font-semibold text-emerald-300">{fm(T.in, ref)}</div></div>
          <div className="rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10"><div className="text-xs text-neutral-400">Sorties (période)</div><div className="mt-1 text-lg font-semibold text-blush-400">{fm(T.out, ref)}</div></div>
          <div className="rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10"><div className="text-xs text-neutral-400">Solde en caisse {endsToday ? 'aujourd’hui' : `au ${fdate(range[1])}`}</div><div className="mt-1 text-lg font-semibold">{fm(T.balanceEnd, ref)}</div><div className="text-[11px] text-neutral-400">cumul depuis le début + solde d’ouverture</div></div>
          <div className="rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10"><div className="text-xs text-neutral-400">Prévision à ce jour (solde + créances − dettes)</div><div className="mt-1 text-lg font-semibold">{fm(T.forecast, ref)}</div></div>
        </div>
      </div>

      <div className="mb-5 space-y-2">
        {tips.map((t, i) => (
          <Notice key={i} tone={t.tone}>{t.text}{t.to && <> <Link className="font-semibold underline" to={t.to}>{t.cta} →</Link></>}</Notice>
        ))}
      </div>

      <section className="card mb-5">
        <h3 className="mb-1 font-display text-base font-semibold">Résumé de la caisse · {rangeLabel}</h3>
        <p className="mb-3 text-xs text-neutral-500">Argent disponible = solde de départ + tout ce qui est rentré − ce qui a été réinvesti dans les projets − les dépenses.</p>
        <div className="space-y-1">
          <MoneyRow label="Solde de la caisse au début" v={T.balanceStart} cur={ref} />
          <MoneyRow label="＋ Ventes encaissées et dépôts" v={T.in - T.apports} cur={ref} />
          {T.apports > 0.004 && <MoneyRow label="＋ Argent avancé par les associés" v={T.apports} cur={ref} />}
          <MoneyRow label="− Réinvesti dans les projets (achats de stock)" v={-((T.byKind.fournisseur || 0) + (T.byKind.fonds || 0))} cur={ref} />
          <MoneyRow label="− Dépenses" v={-T.expensesCash} cur={ref} />
          {((T.byKind.remboursement || 0) + (T.byKind.retrait || 0)) > 0.004 && <MoneyRow label="− Remboursements clients et retraits" v={-((T.byKind.remboursement || 0) + (T.byKind.retrait || 0))} cur={ref} />}
          {(T.byKind.remb_associe || 0) > 0.004 && <MoneyRow label="− Remboursé aux associés" v={-T.byKind.remb_associe} cur={ref} />}
          {(T.byKind.distribution || 0) > 0.004 && <MoneyRow label="− Parts distribuées aux associés" v={-T.byKind.distribution} cur={ref} />}
          <MoneyRow strong label="＝ Argent disponible dans la caisse" v={T.balanceEnd} cur={ref} />
        </div>
        {T.stockBought > 0.004 && <p className="mt-3 text-xs text-neutral-500">Stock acheté sur la période : <b>{fm(T.stockBought, ref)}</b>{T.apports > 0.004 && <> (dont une partie avancée par les associés : {fm(T.apports, ref)} d’apports au total)</>}.</p>}
      </section>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <Ledger title="Entrées de la période">
          {kindRows(IN_KINDS, 1)}
          <MoneyRow strong label="Total des entrées" v={T.in} cur={ref} />
        </Ledger>
        <Ledger title="Sorties de la période" note={T.byKind.fonds > 0.004 ? '« Réinvesti via le fonds » : paiements fournisseurs payés avec le fonds. Ils ne changent ni le chiffre d’affaires, ni le bénéfice, ni les calculs des projets.' : undefined}>
          {kindRows(OUT_KINDS, 1)}
          <MoneyRow strong label="Total des sorties" v={T.out} cur={ref} />
        </Ledger>
      </div>

      <section className="card mb-5">
        <h3 className="mb-3 font-display text-base font-semibold">Entrées et sorties par jour</h3>
        {!T.byDay.length ? <Empty icon="wallet">Aucun mouvement sur cette période.</Empty> : (
          <div className={'space-y-1.5 ' + (hidden ? 'pointer-events-none select-none opacity-60 blur-[5px]' : '')}>
            {T.byDay.slice(-31).map((d) => (
              <div key={d.date} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0 text-neutral-500">{fdate(d.date).slice(0, 5)}</span>
                <div className="flex-1 space-y-0.5">
                  <div className="h-2 rounded-full bg-emerald-500/80" style={{ width: `${(d.in / maxDay) * 100}%`, minWidth: d.in ? 3 : 0 }} title={`Entrées ${money(d.in, ref)}`} />
                  <div className="h-2 rounded-full bg-blush-500/80" style={{ width: `${(d.out / maxDay) * 100}%`, minWidth: d.out ? 3 : 0 }} title={`Sorties ${money(d.out, ref)}`} />
                </div>
                <span className={'w-20 shrink-0 text-right font-medium ' + (d.net >= 0 ? 'text-emerald-700' : 'text-blush-600')}>{fm(d.net, ref)}</span>
              </div>
            ))}
            <div className="flex gap-4 pt-1 text-[11px] text-neutral-500"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Entrées</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-blush-500" />Sorties</span></div>
          </div>
        )}
      </section>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <section className="card !p-2">
          <h3 className="px-3 pb-1 pt-3 font-display text-base font-semibold">Par moyen de paiement</h3>
          {!Object.keys(T.byMethod).length ? <Empty>—</Empty> : (
            <Table head={['Moyen', 'Entrées', 'Sorties']}>
              {Object.entries(T.byMethod).sort((a, b) => b[1].in + b[1].out - a[1].in - a[1].out).map(([k, v]) => (
                <tr key={k}><td className="td font-medium">{k}</td><td className="td">{fm(v.in, ref)}</td><td className="td">{fm(v.out, ref)}</td></tr>
              ))}
            </Table>
          )}
        </section>
        <section className="card !p-2">
          <h3 className="px-3 pb-1 pt-3 font-display text-base font-semibold">Par devise (montants d’origine)</h3>
          {!Object.keys(T.byCurrency).length ? <Empty>—</Empty> : (
            <Table head={['Devise', 'Entrées', 'Sorties', 'Net']}>
              {Object.entries(T.byCurrency).map(([c, v]) => (
                <tr key={c}><td className="td font-medium">{c}</td><td className="td">{fm(v.in, c)}</td><td className="td">{fm(v.out, c)}</td><td className={'td font-semibold ' + (v.in - v.out >= 0 ? 'text-emerald-700' : 'text-blush-600')}>{fm(v.in - v.out, c)}</td></tr>
              ))}
            </Table>
          )}
        </section>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <section className="card">
          <div className="mb-2 flex items-baseline justify-between"><h3 className="font-display text-base font-semibold">À encaisser à ce jour (créances)</h3><b>{fm(T.receivables, ref)}</b></div>
          {!T.topReceivables.length ? <div className="text-sm text-neutral-500">Aucune créance. 🎉</div> : T.topReceivables.map((r) => (
            <Link key={r.id} to={`/ventes/${r.id}`} className="flex justify-between border-b border-line/70 py-2 text-sm last:border-0 hover:underline"><span>{r.label}{r.age > 30 && <span className="ml-1 text-[11px] font-semibold text-blush-600">{r.age} j</span>}</span><b>{fm(r.value, ref)}</b></Link>
          ))}
        </section>
        <section className="card">
          <div className="mb-2 flex items-baseline justify-between"><h3 className="font-display text-base font-semibold">À payer à ce jour (fournisseurs)</h3><b>{fm(T.payables, ref)}</b></div>
          {!T.topPayables.length ? <div className="text-sm text-neutral-500">Aucune dette fournisseur.</div> : T.topPayables.map((r) => (
            <Link key={r.id} to={`/projets/${r.id}`} className="flex justify-between border-b border-line/70 py-2 text-sm last:border-0 hover:underline"><span>{r.label}</span><b>{fm(r.value, ref)}</b></Link>
          ))}
        </section>
      </div>

      <section className="card mb-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base font-semibold">Détail des mouvements <span className="text-xs font-normal text-neutral-500">({T.count} sur la période)</span></h3>
          <select className="input !w-auto !py-2" value={kindF} onChange={(e) => { setKindF(e.target.value); setMore(false) }}>
            <option value="">Tous les types</option>
            {Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <p className="text-xs text-neutral-500">Chaque ligne est un vrai mouvement enregistré (vente encaissée, dépense, paiement fournisseur…). Les plus gros sont en premier : touchez une ligne pour ouvrir son origine et vérifier.</p>
        {(() => {
          const rows = [...T.events].filter((e) => !kindF || e.kind === kindF).sort((a, b) => b.amountRef - a.amountRef)
          const shown = more ? rows : rows.slice(0, 25)
          if (!rows.length) return <Empty icon="wallet">Aucun mouvement.</Empty>
          return (
            <>
              <div className="overflow-x-auto">
                <Table head={['Date', 'Type', 'Détail', 'Moyen', 'Montant']}>
                  {shown.map((e, i) => (
                    <tr key={i} className="hover:bg-paper">
                      <td className="td whitespace-nowrap">{fdate(e.date)}</td>
                      <td className="td text-xs"><span className={e.dir === 'in' ? 'text-emerald-700' : 'text-blush-600'}>{e.dir === 'in' ? '＋' : '−'}</span> {KINDS[e.kind]}</td>
                      <td className="td text-xs">{e.to ? <Link className="underline" to={e.to}>{e.label || 'Voir'}</Link> : e.label}</td>
                      <td className="td text-xs">{e.method}</td>
                      <td className={'td whitespace-nowrap font-medium ' + (e.dir === 'in' ? 'text-emerald-700' : 'text-blush-600')}>{fm(e.amountRef, ref)}{e.currency !== ref && <div className="text-[11px] font-normal text-neutral-500">{fm(e.amount, e.currency)} · taux {e.rate}</div>}</td>
                    </tr>
                  ))}
                </Table>
              </div>
              {rows.length > shown.length && <button className="btn-ghost w-full" onClick={() => setMore(true)}>Voir les {rows.length - shown.length} autres</button>}
            </>
          )
        })()}
      </section>

      {canSetOpening && (
        <section className="card space-y-2">
          <h3 className="font-display text-base font-semibold">Solde d’ouverture</h3>
          <p className="text-xs text-neutral-500">L’argent que vous aviez (caisse + comptes) <b>avant</b> de commencer à utiliser l’application, en {ref}. Il sert à estimer l’argent disponible. Laissez 0 si vous préférez ne compter que les mouvements enregistrés.</p>
          <div className="flex flex-wrap items-end gap-2">
            <NumberInput label={`Montant (${ref})`} value={openDraft} onChange={setOpenDraft} className="w-48" />
            <button className="btn-primary" onClick={saveOpening} disabled={(Number(openDraft) || 0) === opening}>Enregistrer</button>
          </div>
        </section>
      )}
    </>
  )
}
