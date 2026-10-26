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

1. Louvri adrès sekrè sa a (pa gen bouton sou paj koneksyon an ankò) : `https://<non-itilizatè-github-ou>.github.io/tham-beauty/#/premiere-utilisation` → mete non ou, imèl ak modpas → **Créer l'administrateur**.
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

- **Mòd òf-lin** : apre premye koneksyon an (ki mande entènèt), app la travay san entènèt. Vant, peman, depans, resepsyon yo sere sou telefòn lan epi yo pati otomatikman lè entènèt tounen (ou wè yon bann « Hors ligne / en attente »). Limit: kreye yon itilizatè ak chanje modpas mande entènèt. Nimewo yo ki fèt san entènèt gen yon lèt **L** (ex. VTE-2026-L4K9Z). Si de aparèy vann menm dènye atik la san entènèt, stock la ka negatif: verifye apre senkronizasyon.
- **Plan gratis Firebase** : 50 000 lekti/jou, 20 000 ekriti/jou. Pou yon ti biznis, sa sifi; app la telechaje done yo yon fwa pa sesyon.
- **Sovgad** : Firebase pa fè sovgad otomatik nan plan gratis. Regilyèman, itilize **Rapports → Exportations (CSV)**. (Pou sovgad konplè otomatik, bezwen plan Blaze ak "scheduled export".)
- **Foto pwodwi** : sèlman pa lyen (Firebase Storage pa gratis ankò san kat bankè).
- **Mòdpas bliye** : bouton « Mot de passe oublié » voye yon imèl Firebase.

## Mizajou 8 — Marge, PIN, chajman, sesyon

- **Kalkil % yo korije/klarifye** : sou chak atik (Projets → Articles) ak sou Tableau de bord, Ventes, Rapports : *gain* = pri vant − kou revyen. **% an gra = gain ÷ kou revyen** (ex. achte 10, vann 15 → **+50 %**) ; « marge » = gain ÷ pri vant (33,3 %). Yon erè nan **remiz founisè** (reception pasyèl) korije tou : li kounye a se yon pousantaj sou total kòmand lan.
- **PIN nan app la** : pou **chanje PIN** app la mande **modpas kont lan** dabò. Sou ekran verouyaj la, **« PIN oublié ? »** mande modpas kont lan epi kite w kreye yon nouvo PIN **san dekonekte**. Apre 5 move PIN, se modpas kont lan ki mande (pa dekoneksyon).
- **Pa gen ankò ekran vid apre koneksyon** : app la tann reglaj yo chaje, epi yon ekran « Recharger » parèt olye yon paj blan si yon paj plante.
- **Sesyon & retounen kote w te ye** : koneksyon an rete sou telefòn lan, profil la sere pou ouvèti rapid, epi apre yon fèmti (15-20 min oswa plis) app la louvri sou **dènye paj ou te ye a** (12 èdtan). PIN lan sèlman bloke ekran an.
- ⚠️ `firestore.rules` **pa** chanje.

## Mizajou 9 — Koefisyan, remiz, frè global

- **Koefisyan pa atik** (Projets → Articles → ✎) : bouton rapid × 2,2 / 2,3 / 2,4 / 2,5 / 2,6 / 2,8 / 3 oswa yon lòt chif. **Pri vant prevu = pri achte (apre remiz) × koefisyan**, kalkile otomatikman ; ou ka toujou chanje pri a alamen.
- **Remiz founisè** : nan fòm pwojè a, chwazi **montan fiks** oswa **pousantaj (%)**.
- **Frè global** : lè ou ajoute yon depans nan yon pwojè, chwazi *Frais global* (default) oswa *Réparti sur les articles*. Nan onglè Dépenses, bouton **Global ⇄ Réparti** chanje sa pou chak frè. Frè global pa chanje kou revyen chak atik.
- **Objektif « Frais à récupérer »** (Résumé pwojè a) : ba pwogrè, montan rekipere, ak **benefis nèt** ki monte soti nan −frè jiska 0 epi vin pozitif. Si koefisyan yo pa kouvri frè yo, yon avètisman montre **koefisyan minimòm**.
- Tableau de bord : « Frais globaux de projets » retire nan Résultat. Rapports (projets.csv) : kolòn frè global + benefis nèt.
- ⚠️ `firestore.rules` **pa** chanje.

## Mizajou 10 — Mizajou otomatik

- Chak fwa ou mete yon nouvo vèsyon sou GitHub, app la **ale chèche l pou kont li** : lè ou louvri l, chak 10 minit, ak chak fwa ou tounen nan app la. Li enstale l **san ou pa dezenstale ni reenstale anyen**, epi li efase ansyen fichye yo.
- Paj **Sécurité** montre **dat vèsyon an** (anba paj la) pou ou ka wè si telefòn lan gen dènye vèsyon an.
- Rete konsa: apre yon deplwaman (Actions vèt), ouvri app la, tann kèk segonn, epi li rechaje li menm sou nouvo vèsyon an. Si w ap ranpli yon fòm nan moman sa, fini l anvan.

## Mizajou 11 — Ekran vid

- Si ekran an rete vid oswa bloke plis pase 6 segonn, app la montre yon mesaj ak bouton **« Réparer et recharger »** (efase sèlman kachèt app la ; done yo rete nan kont lan) ansanm ak detay erè a.
- Si yon paj plante, app la pa rouvri paj sa a nan pwochen demaraj.

## Mizajou 12 — Admin : modifye/siprime, réduction globale

- **Admin sèlman** : sou chak **depans** (paj Dépenses ak onglè Dépenses pwojè a) ak chak **peman founisè** (onglè Achat & paiements) gen bouton ✎ (modifye) ak 🗑 (siprime). Siprime mande **modpas admin lan** ak yon motif ; chanjman yo make nan Historique pwojè a. Kou revyen, benefis ak solde founisè rekalkile otomatikman. (« Annuler » rete disponib pou kenbe yon tras.)
- **Réduction globale** (paj Nouvelle vente) : kounye a se yon **pèmisyon** « Appliquer une réduction globale sur une vente ». Admin toujou genyen l ; pou lòt itilizatè, aktive l nan **Utilisateurs & réglages → Modifier → pèmisyon**. San pèmisyon an, chan an pa parèt ditou. Réduction pa atik la rete pou tout moun.
- ⚠️ Itilizatè ki te deja egziste pa gen pèmisyon sa a otomatikman : aktive l pou sa ki bezwen l. `firestore.rules` pa chanje.

## Nouvo fonksyon (mizajou 12 oktòb)

- **Logo THAM** nan app la, nan ikòn telefòn lan, ak sou faktè/reçu yo. Pou chanje logo reçu a: **Utilisateurs & réglages → Réglages → Logo & documents** (chanje, montre/kache, gwosè, fòma A4 oswa ticket 80 mm).
- **Stock ↔ Vant** : paj vant lan montre tout atik ki an stock (menm si pwojè a toujou « brouillon »), ak yon chan rechèch. Sou chak **pwodwi** gen bouton **Ajouter au stock**. Paj **Stock** gen **Entrée de stock** (stock san kòmand founisè) ak bouton **Vendre** sou chak liy. Lè ou anrejistre yon réception nan yon pwojè, atik yo antre nan stock.
- **Tableau de bord** : peryòd la se yon meni dewoulan ; filtè yo (pwojè, kliyan, founisè, pwodwi, deviz) nan bouton **Filtres**. Chif yo prezante kòm lis klè (Ventes, Résultat, Trésorerie, Stock, Activité).
- **Mòd san entènèt** : gade seksyon « Limit » anwo a.
- Nouvo design (nwa / lò / woz) ak navigasyon an ba sou telefòn, ak gwo bouton **+** pou yon nouvo vant.

### Kijan pou mete mizajou a sou GitHub
1. Dezipe zip la. Sou GitHub, nan repo a: **Add file → Upload files** epi glise **tout** kontni dosye `tham-beauty` la (yo ranplase ansyen fichye yo).
2. **Fichye `src/lib/firebaseConfig.js` pa nan zip sa a** : konfigirasyon Firebase ou an rete jan li ye, ou pa bezwen refè anyen.
3. Tann onglè **Actions** vin vèt (2-3 minit). Sou telefòn lan, fèmen epi louvri app la **de fwa** pou mizajou a chaje.
4. **Pa bezwen** chanje règ Firestore yo (`firestore.rules` pa chanje).

## Mizajou 13 oktòb

- **Chajman pi rapid** : paj yo chaje sou demann (kòd dekoupe), yon ekran « Chargement » parèt toutswit, logo a pi lejè (276 Ko → 11 Ko), done segondè yo (itilizatè, istorik to, jounal) chaje apre ekran an ouvè, epi app la pa redesine tout bagay pou ti chanjman senkronizasyon.
- **Paj koneksyon** : bouton « Première utilisation » retire. Pou kreye premye admin nan sèlman (sou yon nouvo pwojè Firebase), itilize adrès `…/#/premiere-utilisation`.
- **Corbeille (admin sèlman)** : nan paj yon pwojè, bouton **Supprimer** mande **kòd koneksyon admin lan** (modpas ou). Pwojè a ale nan **Corbeille** (meni → Pilotage) pandan **30 jou**, ou ka **Restaurer** li, epi apre 30 jou li efase definitivman (otomatikman lè admin lan louvri app la, oswa manyèlman ak kòd la). Vant ak depans ki lye ak pwojè a ale ak li.
- **Supresyon vant** : admin lan ka **Supprimer la vente** (→ corbeille 30 jou, atik yo tounen nan stock). Vandè/vandèz/lòt kadè wè **Demander la suppression** ; admin lan wè yon alèt (pastil sou « Ventes », bànyè nan lis vant lan) epi li **Autoriser** oswa **Refuser**.
- **Fenèt (modal)** : yo rete anndan zòn ki vizib la, anlè a pa kache ankò lè klavye a louvri ; kontni an defile anndan fenèt la.
- **Meni mobil** : bouton 3 ba a kounye a anlè agoch ; bouton anba yo rete menm jan.
- ⚠️ **`firestore.rules` CHANJE** : kopye nouvo kontni an nan Firebase → Firestore → Rules → **Publish** (san sa supresyon definitif la ak corbeille a pa mache pou itilizatè yo).

## Mizajou 3 — Stock, mòd sonb, kòd-ba/QR

- **Supresyon pwodwi nan stock (admin sèlman)** : paj **Stock** → ikòn poubèl sou liy lan (chwazi ki lòt/lot yo) ; paj yon pwojè → ✕ sou atik la. Mande **modpas admin lan**, epi pwodwi a ale nan **Corbeille** 30 jou (restorab), apre sa li efase. Sa mache pou **Stock direct** tou. Vant ki deja fèt yo rete entak (istorik la pa chanje).
- **Mòd sonb (dark)** : bouton ☾/☀ anlè adwat (mobil) oswa nan meni an. Pa default li swiv paramèt telefòn lan. Enprime (fakti, reçu, étiquette) toujou rete blan.
- **Kòd-ba (Code 128) ak QR** :
  - Chak pwodwi/variant ka gen yon **Code-barres** (paj Produits : *Scanner* oswa *Générer*). Si l vid, **SKU** a sèvi kòd.
  - **Étiquettes** (Produits → Étiquettes) : enprime etikèt ak kòd-ba + QR + non + pri.
  - **Nouvelle vente → Scanner** : chak scan ajoute atik la otomatikman (pri, lòt, stock) epi yon lòt scan = +1. Ou ka chanje kantite a.
  - **Vente deja validé → Modifier les articles (ADMIN SÈLMAN)** : chanje kantite oswa ajoute atik pa scan ; stock, net ak solde rekalkile, epi chak chanjman make nan vant lan.
  - **Stock → Scanner** : montre fich pwodwi a (stock, pri, lòt) ak bouton Vendre / Ajouter au stock.
  - Kamera a mache sou **Chrome Android** (san entènèt). Ou ka tape kòd la tou, oswa itilize yon **douchette USB/Bluetooth**.
- ⚠️ **`firestore.rules` chanje ankò** : re-kopye li nan Firebase → Rules → **Publish**.

## Mizajou 7 — Inventè, kès, WhatsApp, PIN, lye/dépo, sovgad

- **Inventaire** (Approvisionnement → Inventaire) : konte atik yo pa scan oswa alamen, wè ekar yo, valide pou korije stock la (ajisteman make) ; rapò istorik.
- **Clôture de caisse** (Activité) : chak vandè konpare lajan **Espèces** ki dwe nan kès la ak sa li konte (USD/HTG). Admin wè ekar yo (wouj), ka **Valider** oswa **Rouvrir**.
- **WhatsApp** : bouton *WhatsApp* sou chak vant (mesaj fakti/reçu) + paj **Créances** (balans pa peye, rapèl WhatsApp, apèl). Indicatif pays nan Réglages (509).
- **Verrouillage** (menm Sécurité (PIN)) : tout moun kreye PIN 4-6 chif + anprent/vizaj telefòn lan ; verouyaj otomatik. PIN a rete sou telefòn lan. Admin ka egzije PIN pou tout moun (Réglages → Sécurité).
- **Alèt stock ba** nan klòch la (admin + moun ki wè stock).
- **Komisyon & objektif** : Réglages → *Commissions & objectifs* (admin sèlman wè pa default ; ou ka montre chak vandè pa l). Rapò : komisyon, objektif mwa a, **benefis pa pwodwi/kategori**.
- **Plizyè boutik/depo** : Réglages → *Boutiques / dépôts*. Stock pa lye, chak vant chwazi lye a, **Transférer** nan paj Stock.
- **Sauvegarde/Restauration** : Utilisateurs & réglages → *Sauvegarde* (fichier JSON ; restore = fusion, mande modpas admin).
- ⚠️ `firestore.rules` chanje ankò (inventories, cashClosings, notifications) → **Publish**.

## Mizajou 6 — Alèt vant, vandè nan rapò, fòm k ap defile

- **Alèt « nouvelle vente » pou ADMIN** : chak vant ki fèt voye yon alèt bay TOUT admin (menm si se yon lòt admin ki fè vant lan). Klòch 🔔 (anlè adwat sou mobil, nan meni sou òdinatè) ak pastil non-li, bandeau + bip + notifikasyon sistèm si ou aktive l. Li mache pandan app la ouvè (menm an background). App fèmen nèt : louvri l pou wè nouvo vant yo nan klòch la.
- **Non vandè a parèt kote l itil** : lis vant, detay vant, fakti/reçu, alèt la, tablo de bò (dènye vant), rapò (**Ventes par vendeur** : kantite, CA, panier moyen, benefis) ak ekspòtasyon CSV (kolòn Vendeur).
- **Fòm ki defile** : fenèt yo (Stock, Produits, Vente…) toujou defile anndan yo ; paj la pa janm rete bloke ankò apre yon fenèt/scanner fèmen. Apre yon scan oswa yon ajout, fòm nan desann otomatikman sou liy nan (Nouvelle vente, Modifier la vente), epi nan **Entrée de stock** gen yon bouton **Scanner le produit** ki mennen koursò a sou *Quantité*.
- ⚠️ `firestore.rules` chanje ankò (kolèksyon `notifications`) : re-kopye li → **Publish**.

## Mizajou 5 — Lòt pwodwi (pa sèlman cheve)

- Chak pwodwi gen yon **Type de produit** : *Général* (taille/contenance, matière, detay lib) oswa *Cheveux & perruques* (texture, densité, fermeture). Ansyen pwodwi yo rekonèt otomatikman. Rès app la (stock, vant, projè, kòd-ba, rapò) te deja jeneral.

## Mizajou 4 — Sekirite vant yo

- **Vandè/vandèz pa ka modifye, anile oswa siprime okenn vant.** Bouton *Modifier les articles*, *Annuler la vente*, *Supprimer la vente* ak *Demander la suppression* disparèt pou yo ; se admin lan sèlman. Si yon vandè fè erè, li kontakte responsab li.
- Vandè a toujou ka fè nouvo vant (scan oswa alamen), anrejistre peman ak retou.
- ⚠️ `firestore.rules` chanje : re-kopye li nan Firebase → **Publish** (li bloke chanjman estati/modifikasyon vant pa non-admin).

## Devlopman lokal (si ou vle)

```
npm install
npm run dev      # app la sou http://localhost:5173
npm test         # tès kalkil finansye yo
npm run build
```

## Mizajou 13 — Sekirite ak bug

⚠️ **`firestore.rules` CHANJE** : ale nan Firebase → Firestore → Rules → kole kontni fichye a → **Publish**. San sa, pwoteksyon sèvè yo pa aktif.

Règ Firestore:
- Yon moun ki gen `users.manage` (ki pa admin) pa ka kreye/modifye/efase yon admin ankò (pa ka fè tèt li admin).
- `rates.write` ka chanje sèlman kle `rate` nan settings (pa lòt paramèt).
- `counters`: yon konte kòmanse nan 1 e ka sèlman monte +1.
- `audit` ak `notifications`: ou pa ka ekri sou non yon lòt moun.
- Vant: yon moun ki pa admin pa ka chanje nimewo, devise, to, rabè global oswa vandè apre kreyasyon.

App:
- Esè PIN yo sove sou aparèy la (rechaje paj la pa remèt konte a a 0).
- CSV: pwoteksyon kont enjeksyon fòmil (=, +, -, @).
- Dat: `today()` itilize lè lokal (pa UTC, pa afiche demen aprè 8 PM); dat san lè pa afiche jou anvan an; filtè peryòd yo korije.
- Restore backup: valide id dokiman yo.
- Modpas: minimòm 8 karaktè.

## Mizajou 14 — Chat entèn (Messages)

⚠️ **`firestore.rules` CHANJE ankò** : Firebase → Firestore → Rules → kole kontni fichye a → **Publish**. San sa chat la pa ap mache (permission refusée).

Nouvo meni **Messages** (tout itilizatè aktif, pa bezwen pèmisyon):
- **Prive** : tout moun ka ekri an prive bay nenpòt lòt itilizatè (+ → Message privé).
- **Gwoup** : se admin sèlman ki kreye yo, chwazi manm yo (youn oswa plizyè), epi ka chanje non, ajoute/retire moun, efase gwoup (bouton « Gérer »).
- **Général** : kanal pou tout ekip la, tout moun ekri.
- **Annonces** : admin sèlman ki pibliye, vandè yo li.
- Foto (redui ~900 px, sove nan mesaj la, san Firebase Storage), bandwo + bip + notifikasyon sistèm lè yon mesaj rive, pastij mesaj ki pa li, konfimasyon lekti (✓ voye, ✓✓ li; nan gwoup: ✓✓ + kantite moun ki li).
- Efase mesaj: ou ka efase pwòp mesaj ou; admin ka modere gwoup ak kanal yo. Admin **pa** ka li konvèsasyon prive lòt moun.
- Limit: notifikasyon push lè app la fèmen pa posib san sèvè (se sèlman lè app la louvri/an background).

## Mizajou 15 — Bwat (vant an gro) ak simulasyon

⚠️ **`firestore.rules` CHANJE ankò** : Firebase → Firestore → Rules → Publish.
⚠️ Nouvo pèmisyon **`bundles.write`** (« Préparer des boîtes ») : admin gen li otomatikman; pou lòt moun, kòche l nan Admin → Utilisateurs. Benefis/koute revyen parèt sèlman pou moun ki gen `finance.read`.

Nouvo meni **Boîtes (gros)** :
- Yon bwat = brouillon/simulasyon. Li **pa** touche stock, chif d'afè, ni benefis pwojè yo.
- Ou chwazi atik nan stock (plizyè pwojè) + kantite, ou antre **pri bwat la** (chak bwat gen pwòp pri li, USD oswa HTG).
- Kalkil sou done reyèl: koute revyen total, benefis, marj (% sou pri vant), majorasyon (% sou koute), pri/pyès, rezilta pa pwojè.
- **Sijesyon otomatik**: ou bay pri a (oswa bidjè kliyan an) + marj minimòm + (opsyonèl) kantite max; app la ranpli bwat la ak maksimòm pyès, ekoule stock ki dòmi pi lontan an dabò, epi melanje varyete yo.
- Estati: Brouillon / Envoyée / Acceptée / Vendue / Annulée. Ou ka dupliker yon bwat.
- **Konvèti an vant reyèl** : louvri yon nouvo vant prérempli; pri bwat la separe sou atik yo pwopòsyonèlman ak pri vant planifye chak atik (benefis chak pwojè rete jis). Stock la reverifye, ou ajoute peman an, epi se la chif yo vin reyèl. Bwat la pase « Vendue » epi lye ak vant lan.

## Mizajou 16 — Rôle pèsonalize

`firestore.rules` pa chanje nan mizajou sa a (men si w poko pibliye règ Mizajou 14 ak 15, fè l).

- Nouvo onglè **Admin → Rôles** (pou admin ak moun ki gen `settings.manage`): kreye, modifye, efase rôle, epi kòche pèmisyon yo (ladan l **« Préparer des boîtes »** pou bwat yo).
- Rôle yo se **modèl** : chanje yon rôle pa chanje moun ki deja genyen l. Lè w kreye yon itilizatè ou chwazi rôle a (pèmisyon yo ranpli) epi ou ka ajiste youn pa youn.
- Rôle default yo (Commercial, Stock, Comptable) ka modifye, efase (ou ka rétabli yo), oswa remèt jan yo te ye. Admin rete fiks.
- Yon rôle ki gen itilizatè pa ka efase (chanje rôle moun yo dabò).
- Pou bay yon vandè aksè ak bwat yo: Admin → Utilisateurs → Modifier → kòche « Préparer des boîtes » (oswa kreye yon rôle ki genyen l).

## Mizajou 17 — Je pou kache montan + chat nan mòd nwa

- Tablodbò: yon ti **je** nan bwat prensipal la kache (•••• $) oswa montre tout montan yo; chwa a sonje sou aparèy la.
- Chat: fon gri nan mòd nwa korije (`index.css`); mesaj erè « Envoi refusé » kounye a di ki etap Firebase ki refize l.

## Mizajou 18 — Reenvestisman (fon)

⚠️ **`firestore.rules` CHANJE** (nouvo koleksyon `fundMoves`, admin sèlman) : Firebase → Firestore → Rules → Publish.

Nouvo meni **Réinvestissement** (admin sèlman) + kat « Fonds disponible » sou tablodbò a:
- **Fon an** = pou chak vant ki peye: koute revyen atik yo + X % benefis (default 30 %, ou chanje l nan paj la), o pwo-rata de sa ki peye. Pa janm plis pase lajan ki rantre vre.
- **Réinvestir dans un projet**: admin chwazi pwojè + montan (≤ fon disponib). Sa kreye yon peman fournisè make « Fonds réinvestissement » (benefis/koute pwojè a PA chanje) epi fon an desann. Si w anile peman an (oswa mouvman an), lajan an tounen nan fon an.
- **Retrait** (benefis pou ou) ak **Dépôt externe**, ak istorik; anile pa estati (pa efase).
- **Que racheter ?**: klasman pa benefis pa jou (vitès vant 60 dènye jou × gen pa pyès), kantite pou kouvri N jou, nan limit bidjè a.
- Ti je pou kache montan yo tou nan paj la.

## Mizajou 19 — Pati benefis nan fon an: % oswa montan fiks

Paj Réinvestissement → « Comment le fonds se remplit » : chwazi **Pourcentage du bénéfice** oswa **Montant fiks** (montan total ou deside, ou ka chanje l nenpòt lè; li pa janm depase benefis ki deja ankesè). Kapital la (koute revyen) toujou antre nan fon an. Pa gen chanjman nan règ Firestore.
