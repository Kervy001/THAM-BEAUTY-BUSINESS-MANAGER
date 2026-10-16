import { Component } from 'react'

// Évite l'écran blanc : si une page plante (ou si un fichier de mise à jour est introuvable), on affiche un message
// avec un bouton « Recharger » au lieu d'une page vide. Une erreur de chargement de fichier déclenche UN rechargement automatique.
const isChunkError = (e) => /Loading chunk|dynamically imported module|Importing a module script failed|error loading dynamically/i.test(String(e?.message || e))

export function reloadOnce() {
  try {
    if (sessionStorage.getItem('tb-reloaded') === '1') return false
    sessionStorage.setItem('tb-reloaded', '1')
  } catch { /* rien */ }
  window.location.reload()
  return true
}

export default class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) {
    if (isChunkError(error)) reloadOnce()
    try { console.error(error) } catch { /* rien */ }
  }
  componentDidUpdate(prev) { if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid min-h-[50vh] place-items-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <div className="font-display text-lg font-semibold">Un problème est survenu</div>
          <p className="text-sm text-neutral-600">La page n'a pas pu s'afficher (mise à jour en cours ou connexion lente). Vos données sont en sécurité.</p>
          <button className="btn-primary w-full" onClick={() => window.location.reload()}>Recharger l'application</button>
        </div>
      </div>
    )
  }
}
