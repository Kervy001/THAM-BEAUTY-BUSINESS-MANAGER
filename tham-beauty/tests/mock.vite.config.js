import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
const root = path.resolve('.')
export default defineConfig({
  root, base: './',
  plugins: [react(), {
    name: 'mock-store', enforce: 'pre',
    load(id) { if (id === '\0pwa-stub') return 'export const registerSW = () => {}' },
    resolveId(id, importer) {
      if (id === 'virtual:pwa-register') return '\0pwa-stub'
      if (/lib\/firebase\.js$/.test(id) && importer && !importer.includes('mockFirebase')) return path.join(root, 'tests/mockFirebase.js')
      if (/lib\/store\.jsx$/.test(id) && importer && !importer.includes('mockStore')) return path.join(root, 'tests/mockStore.jsx')
    }
  }],
  server: { port: 5199, strictPort: true }
})
