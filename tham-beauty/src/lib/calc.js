// Logique financière pure (sans Firebase) — testée dans tests/calc.test.js
// Convention : le taux est toujours exprimé en HTG pour 1 USD.

export const CURRENCIES = ['USD', 'HTG']

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
export const round2 = (v) => Math.round((n(v) + Number.EPSILON) * 100) / 100

export function convert(amount, from, to, rate) {
  const a = n(amount)
  if (from === to) return a
  const r = n(rate)
  if (!r) return 0
  if (from === 'USD' && to === 'HTG') return a * r
  if (from === 'HTG' && to === 'USD') return a / r
  return a
}

// ---------- Projets ----------

export function projectExpensesRef(expenses, ref) {
  return (expenses || [])
    .filter((e) => e.status !== 'annule')
    .reduce((s, e) => s + convert(e.amount, e.currency, ref, e.rate), 0)
}

export function itemBasisQty(it) {
  const rec = n(it.qtyReceived)
  return rec > 0 ? rec : n(it.qtyOrdered)
}

export function goodsTotalProjectCur(project) {
  return (project.items || []).reduce((s, it) => s + n(it.unitCost) * n(it.qtyOrdered), 0)
}

// Retourne { perItem: {itemId: {unitPurchaseRef, share, unitCostRef, valueRef}}, totals }
export function projectCosting(project, expenses, ref) {
  const items = project.items || []
  const rate = project.rate
  const cur = project.currency
  const goods = items.reduce((s, it) => s + n(it.unitCost) * itemBasisQty(it), 0)
  const disc = n(project.supplierDiscount)
  const factor = goods > 0 ? Math.max(0, 1 - disc / goods) : 1
  const totalExp = projectExpensesRef(expenses, ref)

  const rows = items.map((it) => {
    const q = itemBasisQty(it)
    const unitPurchaseRef = convert(n(it.unitCost) * factor, cur, ref, rate)
    return { it, q, unitPurchaseRef, valueRef: unitPurchaseRef * q }
  })
  const sumValue = rows.reduce((s, r) => s + r.valueRef, 0)
  const sumQty = rows.reduce((s, r) => s + r.q, 0)
  const method = project.allocMethod || 'value'

  const perItem = {}
  let allocated = 0
  rows.forEach((r) => {
    let share = 0
    if (method === 'qty') share = sumQty > 0 ? (totalExp * r.q) / sumQty : 0
    else if (method === 'manual') share = n(r.it.manualShare)
    else share = sumValue > 0 ? (totalExp * r.valueRef) / sumValue : 0
    allocated += share
    perItem[r.it.id] = {
      unitPurchaseRef: r.unitPurchaseRef,
      valueRef: r.valueRef,
      share,
      unitCostRef: r.q > 0 ? r.unitPurchaseRef + share / r.q : r.unitPurchaseRef
    }
  })
  const goodsRef = sumValue
  return {
    perItem,
    goodsRef,
    expensesRef: totalExp,
    allocatedRef: allocated,
    unallocatedRef: totalExp - allocated,
    totalCostRef: goodsRef + totalExp
  }
}

// ---------- Ventes ----------

export function discountAmount(base, d) {
  if (!d || !n(d.value)) return 0
  return d.type === 'percent' ? (base * n(d.value)) / 100 : n(d.value)
}

// Calcule le détail d'une vente (devise de la vente). Réductions par article = par unité.
export function saleTotals(sale) {
  const lines = sale.lines || []
  const pre = lines.map((l) => {
    const qty = n(l.qty)
    const gross = qty * n(l.unitPrice)
    const unitDisc = Math.min(discountAmount(n(l.unitPrice), l.discount), n(l.unitPrice))
    const lineDisc = qty * unitDisc
    return { l, qty, gross, lineDisc, afterLine: gross - lineDisc }
  })
  const sumAfter = pre.reduce((s, p) => s + p.afterLine, 0)
  const globalDisc = Math.min(discountAmount(sumAfter, sale.globalDiscount), sumAfter)
  const out = pre.map((p) => {
    const globalShare = sumAfter > 0 ? (globalDisc * p.afterLine) / sumAfter : 0
    const net = p.afterLine - globalShare
    const ret = n(p.l.qtyReturned)
    const keep = p.qty > 0 ? Math.max(0, p.qty - ret) / p.qty : 0
    return {
      ...p,
      globalShare,
      net,
      netKept: net * keep,
      qtyKept: Math.max(0, p.qty - ret),
      netUnit: p.qty > 0 ? net / p.qty : 0
    }
  })
  const gross = out.reduce((s, p) => s + p.gross, 0)
  const lineDiscounts = out.reduce((s, p) => s + p.lineDisc, 0)
  const net = out.reduce((s, p) => s + p.net, 0)
  const netKept = out.reduce((s, p) => s + p.netKept, 0)
  return {
    lines: out,
    gross,
    lineDiscounts,
    globalDiscount: globalDisc,
    totalDiscount: lineDiscounts + globalDisc,
    net,
    netKept,
    discountPct: gross > 0 ? ((lineDiscounts + globalDisc) / gross) * 100 : 0
  }
}

// Montant crédité sur une commande/achat (devise de l'opération) pour un paiement
export function paymentCredit(p, opCurrency, opRate) {
  const amt = n(p.amount)
  if (p.currency === opCurrency) return amt
  const r = n(p.rate) || n(opRate)
  return convert(amt, p.currency, opCurrency, r)
}

export function salePayments(sale) {
  const pays = (sale.payments || []).filter((p) => p.status !== 'annule')
  let paid = 0
  let fxRef = 0
  pays.forEach((p) => {
    const sign = p.type === 'refund' ? -1 : 1
    const credit = paymentCredit(p, sale.currency, sale.rate)
    paid += sign * credit
    if (p.currency !== sale.currency) {
      const atOrder = convert(p.amount, p.currency, sale.currency, sale.rate)
      fxRef += sign * convert(credit - atOrder, sale.currency, 'USD', p.rate || sale.rate)
    }
  })
  return { paid, fxUSD: fxRef }
}

export function saleSummary(sale) {
  const t = saleTotals(sale)
  const { paid, fxUSD } = salePayments(sale)
  const balance = round2(t.netKept - paid)
  let payStatus = 'impaye'
  if (t.netKept > 0 && Math.abs(balance) < 0.005) payStatus = 'paye'
  else if (paid > 0 && balance > 0) payStatus = 'partiel'
  else if (balance < -0.005) payStatus = 'trop_percu'
  if (t.netKept === 0 && paid === 0) payStatus = 'paye'
  return { ...t, paid, balance, payStatus, fxUSD }
}

// Chiffres en devise de référence pour une vente (hors ventes annulées).
// lineFilter (facultatif) : ne garde que certaines lignes, SANS recalculer la répartition de la réduction globale.
export function saleProfit(sale, _unused, costingByProject, ref, lineFilter) {
  const t = saleTotals(sale)
  let revenue = 0
  let cogs = 0
  let discount = 0
  let gross = 0
  let qty = 0
  t.lines.forEach((p) => {
    if (lineFilter && !lineFilter(p.l)) return
    revenue += convert(p.netKept, sale.currency, ref, sale.rate)
    gross += convert(p.gross, sale.currency, ref, sale.rate)
    discount += convert(p.lineDisc + p.globalShare, sale.currency, ref, sale.rate)
    const c = costingByProject[p.l.projectId]?.perItem?.[p.l.itemId]
    cogs += (c ? c.unitCostRef : n(p.l.costSnapshot)) * p.qtyKept
    qty += p.qtyKept
  })
  return { revenue, cogs, profit: revenue - cogs, discount, gross, qty }
}

// ---------- Stock ----------

export function itemStock(item, sales) {
  let sold = 0
  let returned = 0
  ;(sales || []).forEach((s) => {
    if (s.status === 'annule') return
    ;(s.lines || []).forEach((l) => {
      if (l.itemId === item.id) {
        sold += n(l.qty)
        returned += n(l.qtyReturned)
      }
    })
  })
  const received = n(item.qtyReceived)
  const lost = n(item.qtyLost)
  return { received, sold, returned, lost, remaining: received - sold + returned - lost }
}

// ---------- Fournisseur ----------

export function purchaseSummary(project) {
  if (project.noSupplier) return { owed: 0, paid: 0, balance: 0, status: 'paye' }
  const owed = goodsTotalProjectCur(project) - n(project.supplierDiscount)
  const paid = (project.supplierPayments || [])
    .filter((p) => p.status !== 'annule')
    .reduce((s, p) => s + paymentCredit(p, project.currency, project.rate), 0)
  const balance = round2(owed - paid)
  let status = 'impaye'
  if (owed > 0 && Math.abs(balance) < 0.005) status = 'paye'
  else if (paid > 0 && balance > 0) status = 'partiel'
  else if (balance < -0.005) status = 'trop_paye'
  return { owed, paid, balance, status }
}

// ---------- Périodes ----------

export function periodRange(kind, custom) {
  const now = new Date()
  const start = new Date(now)
  const end = new Date(now)
  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)
  if (kind === 'jour') return [start, end]
  if (kind === 'semaine') {
    const d = (start.getDay() + 6) % 7
    start.setDate(start.getDate() - d)
    return [start, end]
  }
  if (kind === 'mois') {
    start.setDate(1)
    return [start, end]
  }
  if (kind === 'trimestre') {
    start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1)
    return [start, end]
  }
  if (kind === 'annee') {
    start.setMonth(0, 1)
    return [start, end]
  }
  if (kind === 'perso' && custom) {
    const s = custom.from ? new Date(custom.from + 'T00:00:00') : new Date(0)
    const e = custom.to ? new Date(custom.to + 'T23:59:59') : end
    return [s, e]
  }
  return [new Date(0), new Date(8640000000000000)]
}

export function inRange(dateStr, range) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  return d >= range[0] && d <= range[1]
}

// ---------- Statistiques d'un projet (devise de référence) ----------
export function projectStats(project, sales, costing, ref, generalRate) {
  const c = costing || { perItem: {}, goodsRef: 0, expensesRef: 0 }
  let qtyOrdered = 0, qtyReceived = 0, sold = 0, returned = 0, remaining = 0
  let stockValueRef = 0, plannedRevenueRef = 0
  ;(project.items || []).forEach((it) => {
    const st = itemStock(it, sales)
    qtyOrdered += n(it.qtyOrdered)
    qtyReceived += st.received
    sold += st.sold
    returned += st.returned
    remaining += st.remaining
    const unit = c.perItem[it.id]?.unitCostRef || 0
    stockValueRef += st.remaining * unit
    plannedRevenueRef += convert(n(it.plannedPrice), it.plannedCurrency || 'USD', ref, generalRate) * itemBasisQty(it)
  })
  let revenueRef = 0, cogsRef = 0, discountRef = 0
  ;(sales || []).forEach((s) => {
    if (s.status === 'annule') return
    if (!(s.lines || []).some((l) => l.projectId === project.id)) return
    const p = saleProfit(s, {}, { [project.id]: c }, ref, (l) => l.projectId === project.id)
    revenueRef += p.revenue
    cogsRef += p.cogs
    discountRef += p.discount
  })
  return {
    qtyOrdered, qtyReceived, sold, returned, remaining, stockValueRef, plannedRevenueRef,
    revenueRef, cogsRef, discountRef, profitRef: revenueRef - cogsRef,
    goodsRef: c.goodsRef, expensesRef: c.expensesRef, totalCostRef: c.goodsRef + c.expensesRef,
    forecastProfitRef: plannedRevenueRef - (c.goodsRef + c.expensesRef)
  }
}
