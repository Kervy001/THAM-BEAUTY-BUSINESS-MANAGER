import { createServer } from 'vite'
import path from 'node:path'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
const root = path.resolve('.')
const server = await createServer({
  root, logLevel: 'error', appType: 'custom', server: { middlewareMode: true },
  plugins: [{ name: 'mock-store', enforce: 'pre', resolveId(id, importer) { if (/lib\/store\.jsx$/.test(id) && importer && !importer.includes('mockStore')) return path.join(root, 'tests/mockStore.jsx') } }],
  resolve: { alias: {} }, optimizeDeps: { noDiscovery: true, include: [] }
})
const mods = {
  Dashboard: (await server.ssrLoadModule('/src/pages/Dashboard.jsx')).default,
  Projects: (await server.ssrLoadModule('/src/pages/Projects.jsx')).Projects,
  ProjectDetail: (await server.ssrLoadModule('/src/pages/Projects.jsx')).ProjectDetail,
  Products: (await server.ssrLoadModule('/src/pages/Products.jsx')).default,
  Customers: (await server.ssrLoadModule('/src/pages/Partners.jsx')).Customers,
  Suppliers: (await server.ssrLoadModule('/src/pages/Partners.jsx')).Suppliers,
  Sales: (await server.ssrLoadModule('/src/pages/Sales.jsx')).Sales,
  NewSale: (await server.ssrLoadModule('/src/pages/Sales.jsx')).NewSale,
  SaleDetail: (await server.ssrLoadModule('/src/pages/Sales.jsx')).SaleDetail,
  Expenses: (await server.ssrLoadModule('/src/pages/Expenses.jsx')).default,
  Stock: (await server.ssrLoadModule('/src/pages/Stock.jsx')).default,
  Rates: (await server.ssrLoadModule('/src/pages/Rates.jsx')).default,
  Reports: (await server.ssrLoadModule('/src/pages/Reports.jsx')).default,
  Admin: (await server.ssrLoadModule('/src/pages/Admin.jsx')).default
}
const routes = { ProjectDetail: ['/projets/p1', '/projets/:id'], SaleDetail: ['/ventes/s1', '/ventes/:id'] }
let bad = 0
for (const [name, C] of Object.entries(mods)) {
  const [url, pattern] = routes[name] || ['/', '/']
  try {
    const html = renderToString(React.createElement(MemoryRouter, { initialEntries: [url] }, React.createElement(Routes, null, React.createElement(Route, { path: pattern, element: React.createElement(C) }))))
    console.log('OK  ', name, html.length)
    if (name === 'SaleDetail') console.log('     ', /Payé/.test(html), html.match(/Solde[^<]*<[^>]*>[^<]*/)?.[0]?.slice(0, 80))
  } catch (e) { bad++; console.log('FAIL', name, e.message.split('\n')[0]) }
}
await server.close()
process.exit(bad ? 1 : 0)
