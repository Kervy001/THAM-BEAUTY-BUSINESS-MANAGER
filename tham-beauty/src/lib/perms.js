export const PERMS = {
  'sales.write': 'Enregistrer des ventes',
  'sales.pay': 'Enregistrer des paiements clients',
  'discount.authorize': 'Autoriser les grosses réductions',
  'discount.global': 'Appliquer une réduction globale sur une vente',
  'bundles.write': 'Préparer des boîtes (simulation de vente en gros)',
  'customers.write': 'Gérer les clients',
  'products.write': 'Gérer les produits et variantes',
  'dashboard.read': 'Voir le tableau de bord (de son magasin)',
  'messages.use': 'Utiliser la messagerie',
  'customers.read': 'Voir / chercher les clients',
  'receivables.read': 'Voir les créances clients (de son magasin)',
  'cash.close': 'Clôture de caisse (de son magasin)',
  'stock.read': 'Consulter les stocks (de son magasin)',
  'stock.write': 'Réceptions, retours, pertes',
  'projects.read': 'Voir les projets et leurs dépenses (coûts)',
  'projects.write': 'Créer / modifier les projets',
  'costs.read': 'Voir les prix d’achat et coûts de revient',
  'suppliers.write': 'Gérer les fournisseurs',
  'expenses.write': 'Enregistrer les dépenses',
  'payments.write': 'Paiements fournisseurs',
  'finance.read': 'Voir bénéfices, marges, trésorerie et rapports financiers',
  'export': 'Exporter les données',
  'rates.write': 'Modifier le taux de change',
  'settings.manage': 'Modifier les paramètres',
  'locations.all': 'Voir tous les magasins (sinon seulement ceux attribués)',
  'users.manage': 'Gérer les utilisateurs'
}

export const ROLES = {
  admin: { label: 'Administrateur principal', perms: Object.keys(PERMS) },
  commercial: {
    label: 'Employé commercial',
    perms: ['sales.write', 'sales.pay', 'customers.write', 'customers.read', 'stock.read', 'dashboard.read', 'messages.use', 'receivables.read', 'cash.close']
  },
  stock: { label: 'Gestionnaire des stocks', perms: ['stock.read', 'stock.write', 'dashboard.read', 'messages.use'] },
  comptable: {
    label: 'Comptable / gestionnaire financier',
    perms: ['finance.read', 'costs.read', 'projects.read', 'expenses.write', 'payments.write', 'sales.pay', 'export', 'stock.read', 'dashboard.read', 'messages.use', 'customers.read', 'receivables.read', 'cash.close']
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

// Comptes créés avant les nouvelles autorisations (permsV2 absent) : elles se déduisent de leurs anciennes autorisations,
// pour que personne ne perde un accès par surprise. Dès que l'administrateur enregistre le compte, les cases cochées font foi.
// Exception volontaire : « Voir les projets / prix d'achat » ne se déduit PAS de stock.read (un vendeur ne voit pas les coûts).
const LEGACY = {
  'dashboard.read': null, 'messages.use': null,
  'customers.read': ['customers.write', 'sales.write', 'finance.read'],
  'receivables.read': ['sales.pay', 'sales.write', 'finance.read'],
  'cash.close': ['sales.pay', 'sales.write', 'finance.read'],
  'projects.read': ['projects.write', 'finance.read', 'stock.write', 'payments.write', 'expenses.write'],
  'costs.read': ['finance.read', 'projects.write']
}
export const can = (profile, p) => {
  if (!profile || profile.active === false) return false
  if (profile.role === 'admin' || (profile.perms || []).includes(p)) return true
  if (profile.permsV2 || !(p in LEGACY)) return false
  const l = LEGACY[p]
  return l === null || l.some((x) => (profile.perms || []).includes(x))
}
// Liste complète des autorisations réellement en vigueur pour un compte (sert à préremplir le formulaire de l'administrateur)
export const effectivePerms = (profile) => Object.keys(PERMS).filter((k) => k !== 'users.manage' && can(profile, k))
