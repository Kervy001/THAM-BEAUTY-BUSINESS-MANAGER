export const PERMS = {
  'sales.write': 'Enregistrer des ventes',
  'sales.pay': 'Enregistrer des paiements clients',
  'discount.authorize': 'Autoriser les grosses réductions',
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

export const can = (profile, p) => !!profile && profile.active !== false && (profile.role === 'admin' || (profile.perms || []).includes(p))
