import { initializeApp, getApps, deleteApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore } from 'firebase/firestore'
import { firebaseConfig } from './firebaseConfig.js'

export const isConfigured = !String(firebaseConfig.apiKey).startsWith('REMPLACER')

export const app = initializeApp(isConfigured ? firebaseConfig : { ...firebaseConfig, apiKey: 'x', projectId: 'x', appId: 'x' })
export const auth = getAuth(app)
// Pas de cache hors ligne : une opération financière n'est « enregistrée » que si le serveur la confirme.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true })

// Application secondaire : permet à l'administrateur de créer un compte sans être déconnecté.
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
