import { projectCosting } from '../src/lib/calc.js'
import { DEFAULT_EXPENSE_CATEGORIES } from '../src/lib/util.js'
import { ROLES } from '../src/lib/perms.js'

export const DEFAULT_SETTINGS = { rate: 135, refCurrency: 'USD', discountUsual: 5, discountWarn: 10, discountAuth: 20, lowStock: 3, company: { name: 'THAM BEAUTY', phone: '', address: 'Haïti', footer: 'Merci' }, receipt: { showLogo: true, logoWidth: 90, format: 'a4' }, logo: '', expenseCategories: DEFAULT_EXPENSE_CATEGORIES }
const projects = [{ id: 'p1', number: 'PRJ-2026-0001', name: '40 perruques', status: 'vente', supplierId: 's1', supplierName: 'Fourn', currency: 'USD', rate: 135, allocMethod: 'value', orderDate: '2026-09-01', supplierDiscount: 0,
  items: [{ id: 'i1', productId: 'pr1', variantId: 'v1', label: 'Lace Frontal — 12 pouces', sku: 'LF-12', qtyOrdered: 40, qtyReceived: 40, unitCost: 50, plannedPrice: 100, plannedCurrency: 'USD' }],
  receipts: [{ id: 'r1', date: '2026-09-10', lines: [{ label: 'x', qty: 40, lost: 0 }] }], supplierPayments: [{ id: 'sp1', amount: 1000, currency: 'USD', rate: 135, date: '2026-09-02', method: 'Virement' }], history: [{ at: '2026-09-01T10:00:00Z', by: 'A', text: 'créé' }] }]
projects.push({ id: 'p2', number: 'PRJ-2026-0002', name: 'Brouillon reçu', status: 'brouillon', supplierId: 's1', supplierName: 'Fourn', currency: 'USD', rate: 135, allocMethod: 'value', orderDate: '2026-10-02', supplierDiscount: 0, items: [{ id: 'i2', productId: '', variantId: '', label: 'Bundle 14 pouces', sku: 'BD-14', qtyOrdered: 5, qtyReceived: 5, unitCost: 20, plannedPrice: 45, plannedCurrency: 'USD' }], receipts: [], supplierPayments: [], history: [] })
const expenses = [{ id: 'e1', projectId: 'p1', number: 'DEP-1', category: 'Transport aérien', amount: 100, currency: 'USD', rate: 135, date: '2026-10-01', status: 'valide' }]
const sales = [{ id: 's1', number: 'VTE-2026-0001', date: '2026-10-05', status: 'valide', currency: 'USD', rate: 135, customerId: 'c1', customerName: 'Marie', delivery: 'a_livrer',
  lines: [{ id: 'l1', projectId: 'p1', itemId: 'i1', label: 'Lace Frontal — 12 pouces', qty: 2, unitPrice: 100, discount: { type: 'fixed', value: 5 }, qtyReturned: 0 }], globalDiscount: { type: 'fixed', value: 0 },
  payments: [{ id: 'py1', type: 'payment', amount: 5000, currency: 'HTG', rate: 136, date: '2026-10-05', method: 'MonCash', status: 'valide' }], returns: [] }]
const D = { projects, expenses, sales, products: [{ id: 'pr1', name: 'Lace Frontal', sku: 'LF', variants: [{ id: 'v1', label: '12 pouces', sku: 'LF-12', price: 100, priceCurrency: 'USD' }] }], suppliers: [{ id: 's1', name: 'Fourn' }], customers: [{ id: 'c1', name: 'Marie' }], users: [{ id: 'u1', name: 'Admin', email: 'a@a.com', role: 'admin', perms: ROLES.admin.perms, active: true }], rateHistory: [{ id: 'h', oldRate: 130, newRate: 135, at: '2026-10-01', userName: 'A' }] }
const costing = { p1: projectCosting(projects[0], expenses, 'USD'), p2: projectCosting(projects[1], [], 'USD') }
const value = { authUser: { uid: 'u1' }, profile: D.users[0], active: true, settings: DEFAULT_SETTINGS, ref: 'USD', rate: 135, online: true, hasPending: false, toasts: [], D, costing, audit: [{ id: 'a', at: '2026-10-01', userName: 'A', action: 'x', entity: 'e', detail: 'd' }], save: async () => 'id', saveSettings: async () => {}, write: async (p) => p, notify: () => {}, logAudit: async () => {}, nextNumber: async () => 'X-1', can: () => true, logout: () => {} }
export const useApp = () => ({ ...value, ...(globalThis.__mock || {}) })
export const AppProvider = ({ children }) => children
