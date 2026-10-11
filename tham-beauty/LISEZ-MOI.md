# THAM BEAUTY BUSINESS MANAGER — Gid enstalasyon (gratis)

App sa a se yon **PWA** (aplikasyon web ou enstale sou telefòn Android). Li mache ak:
- **GitHub Pages** (gratis) pou mete app la sou entènèt (HTTPS),
- **Firebase** (plan gratis "Spark") pou baz done santral la ak koneksyon itilizatè yo.

Tout done yo sere nan Firebase, pa nan navigatè a. Telefòn ak òdinatè wè menm done yo.

> Chanjman nan teknoloji: kaye de chaj la rekòmande Laravel/MySQL, men sa mande yon sèvè PHP peye. Pou ou ka mete l GRATIS sou GitHub, mwen itilize React + Firebase. Tout fonksyon yo nan kaye de chaj la swiv.

---

## ETAP 1 — Kreye pwojè Firebase (10 minit)

1. Ale sou https://console.firebase.google.com → **Add project** → bay li yon non (ex. `tham-beauty`) → kontinye (ou ka dezaktive Google Analytics).
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
3. **Build → Firestore Database → Create database** → chwazi **Production mode** → chwazi yon rejyon (ex. `nam5` / `us-east`) → Enable.
4. Nan Firestore, ale nan onglè **Rules**. Efase tout bagay ki la, kole kontni fichye **`firestore.rules`** (nan pwojè sa a) → **Publish**.
5. Ale nan ⚙️ **Project settings → General → Your apps → ikòn Web `</>`** → bay yon non → **Register app**. Kopye blòk `firebaseConfig` la.
6. Louvri fichye **`src/lib/firebaseConfig.js`** epi ranplase valè `REMPLACER` yo ak sa ou kopye a. (Valè sa yo pa sekrè : sekirite a soti nan règ Firestore yo.)

## ETAP 2 — Mete kòd la sou GitHub

1. Ale sou https://github.com → **New repository** → non: `tham-beauty` → **Public** (GitHub Pages gratis mande Public) → Create.
2. **Upload files** → glise TOUT sa ki nan dosye sa a (men **pa** `node_modules` ni `dist`) → **Commit changes**. Dosye kache `.github` la (workflow deplwaman an) pafwa pa monte ak glise-depoze. Si ou pa wè l nan repo a: **Add file → Create new file**, tape `.github/workflows/deploy.yml` kòm non, epi kole kontni fichye `.github/workflows/deploy.yml` la.
3. Nan repo a: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Ale nan onglè **Actions**: ou ap wè yon deplwaman ap kouri (2-3 minit). Lè li vèt, adrès app ou a se:
   `https://<non-itilizatè-github-ou>.github.io/tham-beauty/`

## ETAP 3 — Otorize adrès la nan Firebase

Firebase → **Authentication → Settings → Authorized domains → Add domain** → ajoute `<non-itilizatè-github-ou>.github.io`.
(San sa, koneksyon an pa ap mache.)

## ETAP 4 — Premye itilizasyon

1. Louvri adrès app la. Klike **« Première utilisation »** → mete non ou, imèl ak modpas → **Créer l'administrateur**.
   Se sèlman PREMYE kont lan ki ka fèt konsa : li vin **Administrateur principal**. Apre sa, sa fèmen otomatikman (règ Firebase yo).
2. Ale nan **Taux de change** epi mete to jodi a. Nan **Utilisateurs & réglages**, ajoute anplwaye yo (komèsyal, jeran estòk, kontab) ak otorizasyon yo.

## ETAP 5 — Enstale sou telefòn Android

Louvri adrès la nan **Chrome** → meni ⋮ → **« Installer l'application »** / « Ajouter à l'écran d'accueil ». Ikòn **THAM BEAUTY** ap parèt. Li louvri tankou yon vrè app, san ba navigatè a. Mizajou yo fèt otomatikman.

---

## Kijan pou itilize l (rezime)

1. **Fournisseurs / Clients / Produits** : kreye yo (pwodwi ak varyant, chak ak SKU pa li).
2. **Projets** : yon kòmand founisè = yon pwojè. Ajoute atik yo (kantite, pri acha, pri vant prevwa), mete **taux acha a**.
3. **Réceptions** : anrejistre sa ki rive (pasyèl oswa total). Se sèlman sa ki rive ki antre nan estòk.
4. **Dépenses** : ajoute transp, douane, frè MonCash... sou pwojè a (chak ak pwòp taux li). Chwazi kijan pou separe yo (valè, kantite, manyèl) → **kou revyen** kalkile otomatikman.
5. **Ventes** : chwazi atik nan estòk, mete pri, rediksyon (pa atik oswa global), **taux kòmand lan**, epi peman (USD/HTG, chak ak taux li).
6. **Tablo bò / Rapports** : bénéfice réalisé ≠ prévisionnel, chif d'afè ≠ encaissements, dèt/kreyans, estòk, ekspòte CSV (Excel). **Facture / Reçu** : bouton enprime → "Enregistrer en PDF".

## Règ kle yo ki respekte

- Taux istorik yo pa janm chanje (chak kòmand, achte, peman, depans gen pwòp taux li).
- Pa gen **supresyon silansye** : vant, peman, depans yo **anile** ak yon motif (yo rete vizib). Règ Firebase yo entèdi efase yo.
- Chak aksyon sansib mete non itilizatè a; onglè **Historique** (admin) montre jounal la.
- Depans pwojè yo pa konte de fwa : yo antre nan kou revyen, epi yo sòti nan "coût des marchandises vendues" selman pou atik ki vandi.

## Limit li enpòtan pou ou konnen

- **Mòd san entènèt** : v1 mande entènèt pou anrejistre (kaye de chaj la di sa pa obligatwa nan v1). San entènèt, app la ouvè men ou pa ka anrejistre vant/peman.
- **Plan gratis Firebase** : 50 000 lekti/jou, 20 000 ekriti/jou. Pou yon ti biznis, sa sifi; app la telechaje done yo yon fwa pa sesyon.
- **Sovgad** : Firebase pa fè sovgad otomatik nan plan gratis. Regilyèman, itilize **Rapports → Exportations (CSV)**. (Pou sovgad konplè otomatik, bezwen plan Blaze ak "scheduled export".)
- **Foto pwodwi** : sèlman pa lyen (Firebase Storage pa gratis ankò san kat bankè).
- **Mòdpas bliye** : bouton « Mot de passe oublié » voye yon imèl Firebase.

## Devlopman lokal (si ou vle)

```
npm install
npm run dev      # app la sou http://localhost:5173
npm test         # tès kalkil finansye yo
npm run build
```
