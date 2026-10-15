import { convert, inRange, itemStock, projectStats, purchaseSummary, saleSummary, saleProfit, saleTotals, salePayments } from './calc.js'

// Calcule tous les indicateurs à partir des données réelles. f = { range, projectId, customerId, supplierId, productId, currency }
export function computeMetrics({ D, costing, ref, rate, settings }, f) {
  const projects = D.projects.filter((p) => (!f.projectId || p.id === f.projectId) && (!f.supplierId || p.supplierId === f.supplierId))
  const projIds = new Set(projects.map((p) => p.id))
  const itemMeta = {}
  D.projects.forEach((p) => (p.items || []).forEach((it) => { itemMeta[it.id] = { p, it } }))
  const lineOk = (l) => projIds.has(l.projectId) && (!f.productId || itemMeta[l.itemId]?.it.productId === f.productId)

  let gross = 0, discount = 0, net = 0, cogs = 0, nbSales = 0, fx = 0
  const byItem = {}, byProject = {}, byDay = {}
  const sales = D.sales.filter((s) => s.status !== 'annule' && inRange(s.date, f.range) && (!f.customerId || s.customerId === f.customerId) && (!f.currency || s.currency === f.currency))
  sales.forEach((s) => {
    if (!(s.lines || []).some(lineOk)) return
    const pr = saleProfit(s, {}, costing, ref, lineOk)
    if (pr.qty <= 0 && pr.revenue === 0) return
    nbSales++
    gross += pr.gross; discount += pr.discount; net += pr.revenue; cogs += pr.cogs
    const t = saleTotals(s)
    t.lines.forEach((tl) => {
      if (!lineOk(tl.l)) return
      const c = costing[tl.l.projectId]?.perItem?.[tl.l.itemId]
      const rev = convert(tl.netKept, s.currency, ref, s.rate)
      const cg = (c ? c.unitCostRef : Number(tl.l.costSnapshot) || 0) * tl.qtyKept
      const bi = (byItem[tl.l.label] ||= { label: tl.l.label, qty: 0, revenue: 0 })
      bi.qty += tl.qtyKept; bi.revenue += rev
      const bp = (byProject[tl.l.projectId] ||= { id: tl.l.projectId, revenue: 0, profit: 0 })
      bp.revenue += rev; bp.profit += rev - cg
    })
    byDay[s.date] = (byDay[s.date] || 0) + pr.revenue
  })

  // Encaissements / décaissements de la période
  let cashIn = 0, cashOut = 0
  D.sales.filter((s) => s.status !== 'annule' && (!f.customerId || s.customerId === f.customerId) && (!f.currency || s.currency === f.currency) && (!f.projectId || (s.lines || []).some((l) => l.projectId === f.projectId))).forEach((s) => {
    ;(s.payments || []).filter((p) => p.status !== 'annule' && inRange(p.date, f.range)).forEach((p) => {
      const v = convert(p.amount, p.currency, ref, p.rate)
      if (p.type === 'refund') cashOut += v; else cashIn += v
    })
    const sp = salePayments({ ...s, payments: (s.payments || []).filter((p) => inRange(p.date, f.range)) })
    fx += convert(sp.fxUSD, 'USD', ref, rate)
  })
  const expenses = D.expenses.filter((e) => e.status !== 'annule' && inRange(e.date, f.range) && (!f.projectId || e.projectId === f.projectId))
  const expProject = expenses.filter((e) => e.projectId).reduce((s, e) => s + convert(e.amount, e.currency, ref, e.rate), 0)
  const expGeneral = f.projectId ? 0 : expenses.filter((e) => !e.projectId).reduce((s, e) => s + convert(e.amount, e.currency, ref, e.rate), 0)
  let supplierPaid = 0
  projects.forEach((p) => (p.supplierPayments || []).filter((x) => x.status !== 'annule' && inRange(x.date, f.range)).forEach((x) => { supplierPaid += convert(x.amount, x.currency, ref, x.rate) }))
  cashOut += expProject + expGeneral + supplierPaid

  // Créances / dettes (à date)
  let receivables = 0, unpaidInvoices = 0
  D.sales.filter((s) => s.status !== 'annule' && (!f.customerId || s.customerId === f.customerId)).forEach((s) => {
    const r = saleSummary(s)
    if (r.balance > 0.005) { receivables += convert(r.balance, s.currency, ref, s.rate); unpaidInvoices++ }
  })
  let payables = 0
  projects.forEach((p) => { const b = purchaseSummary(p).balance; if (b > 0.005) payables += convert(b, p.currency, ref, p.rate) })

  // Stock & prévisions
  let refs = 0, available = 0, outOfStock = 0, lowStock = 0, stockValue = 0, forecast = 0
  const slow = []
  projects.forEach((p) => {
    const st = projectStats(p, D.sales, costing[p.id], ref, rate)
    if (!['archive', 'termine'].includes(p.status)) forecast += st.forecastProfitRef
    ;(p.items || []).forEach((it) => {
      if (f.productId && it.productId !== f.productId) return
      const s = itemStock(it, D.sales)
      if (s.received <= 0) return
      refs++
      available += s.remaining
      stockValue += s.remaining * (costing[p.id]?.perItem?.[it.id]?.unitCostRef || 0)
      if (s.remaining <= 0) outOfStock++
      else if (s.remaining <= (settings.lowStock ?? 3)) lowStock++
      const rotation = s.received > 0 ? s.sold / s.received : 0
      if (s.remaining > 0 && rotation < 0.2 && p.orderDate && (Date.now() - new Date(p.orderDate)) / 864e5 > 30) slow.push({ label: it.label, project: p.number, remaining: s.remaining, rotation })
    })
  })

  const topItems = Object.values(byItem).sort((a, b) => b.qty - a.qty).slice(0, 5)
  const topProjects = Object.values(byProject).map((x) => ({ ...x, p: D.projects.find((p) => p.id === x.id) })).sort((a, b) => b.profit - a.profit).slice(0, 5)

  return {
    gross, discount, net, cogs, grossProfit: net - cogs, nbSales, avgBasket: nbSales ? net / nbSales : 0,
    expGeneral, expProject, netResult: net - cogs - expGeneral,
    cashIn, cashOut, treasury: cashIn - cashOut, fx, receivables, payables, unpaidInvoices, forecast,
    refs, available, outOfStock, lowStock, stockValue, slow, topItems, topProjects, byDay,
    activeProjects: D.projects.filter((p) => !['termine', 'archive'].includes(p.status)).length,
    discountPct: gross > 0 ? (discount / gross) * 100 : 0
  }
}
