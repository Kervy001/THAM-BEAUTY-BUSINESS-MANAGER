export const PERMS = {
  'sales.write': 'Enregistrer des ventes',
  'sales.pay': 'Enregistrer des paiements clients',
  'discount.authorize': 'Autoriser les grosses réductions',
  'discount.global': 'Appliquer une réduction globale sur une vente',
  'bundles.write': 'Préparer des boîtes (simulation de vente en gros)',
  'customers.write': 'Gérer les clients',
  'products.write': 'Gérer les produits et variantes',
  'stock.read': 'Consulter les stocks',
  'stock.write': 'Réceptions, retours, pertes',
  'projects.write': 'Créer / modifier les projets',
  'suppliers.write': 'Gérer les fournisseurs',
  'expenses.write': 'Enregistrer les dépenses',
  'payments.write': 'Paiements fournisseurs',
  'finance.read': 'Voir les rapports et chiffres financiers',
  'export': 'Exporter les données',
  'rates.write': 'Modifier le taux de change',
  'settings.manage': 'Modifier les paramètres',
  'users.manage': 'Gérer les utilisateurs'
}

export const ROLES = {
  admin: { label: 'Administrateur principal', perms: Object.keys(PERMS) },
  commercial: {
    label: 'Employé commercial',
    perms: ['sales.write', 'sales.pay', 'customers.write', 'stock.read']
  },
  stock: { label: 'Gestionnaire des stocks', perms: ['stock.read', 'stock.write'] },
  comptable: {
    label: 'Comptable / gestionnaire financier',
    perms: ['finance.read', 'expenses.write', 'payments.write', 'sales.pay', 'export', 'stock.read']
  }
}

// Rôles effectifs = rôles par défaut (modifiables / supprimables) + rôles créés par l'administrateur (réglages → roles).
// Un rôle n'est qu'un MODÈLE : il préremplit les autorisations d'un utilisateur ; chaque utilisateur garde ses propres autorisations.
export function rolesOf(settings) {
  const custom = settings?.roles || {}
  const out = {}
  Object.entries(ROLES).forEach(([id, r]) => {
    const c = custom[id]
    if (id === 'admin') out[id] = r
    else if (!c?.deleted) out[id] = c ? { label: c.label || r.label, perms: (c.perms || r.perms).filter((p) => p in PERMS), edited: true } : r
  })
  Object.entries(custom).forEach(([id, c]) => { if (!ROLES[id] && c && !c.deleted) out[id] = { label: c.label || id, perms: (c.perms || []).filter((p) => p in PERMS), custom: true } })
  return out
}
export const roleLabel = (settings, id) => rolesOf(settings)[id]?.label || ROLES[id]?.label || id || '—'

export const can = (profile, p) => !!profile && profile.active !== false && (profile.role === 'admin' || (profile.perms || []).includes(p))
