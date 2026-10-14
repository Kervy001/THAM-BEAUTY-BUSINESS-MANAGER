import { initializeApp, getApps, deleteApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { firebaseConfig } from './firebaseConfig.js'

export const isConfigured = !String(firebaseConfig.apiKey).startsWith('REMPLACER')

export const app = initializeApp(isConfigured ? firebaseConfig : { ...firebaseConfig, apiKey: 'x', projectId: 'x', appId: 'x' })
export const auth = getAuth(app)

// Mode hors ligne : les données sont gardées sur l'appareil (IndexedDB). Les opérations saisies sans Internet
// sont mises en file d'attente puis envoyées automatiquement au retour de la connexion.
function makeDb() {
  try {
    return initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    })
  } catch {
    return initializeFirestore(app, { ignoreUndefinedProperties: true })
  }
}
export const db = makeDb()

// Application secondaire : permet à l'administrateur de créer un compte sans être déconnecté (Internet requis).
export async function withSecondaryAuth(fn) {
  const name = 'secondary-' + Date.now()
  const sec = initializeApp(firebaseConfig, name)
  try {
    return await fn(getAuth(sec))
  } finally {
    await deleteApp(sec)
  }
}
export { getApps }
