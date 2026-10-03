# Snackerie

La snackerie est une catégorie du repas existant (`classic` ou `snack`). La bibliothèque prestataire permet de la choisir à la création/modification, puis de publier les deux catégories dans le même planning. Les commandes partagent le panier, la confirmation de quantité quotidienne, le paiement, les crédits, les annulations et la limite horaire existants.

Les filtres sont disponibles dans le parcours parent, les listes et préparations prestataire, les commandes admin et les écrans école. Les exports indiquent la catégorie du repas. La liste des élèves prestataire affiche les quantités par catégorie pour la date choisie ; un élève ayant les deux apparaît dans chaque filtre.

## Données et publication

Appliquer `supabase/migrations/20261003140000_meal_categories.sql` avant le déploiement web. Les repas existants restent classiques. La catégorie est copiée depuis la bibliothèque à la publication ; une modification ultérieure de la bibliothèque ne reclassifie pas les commandes historiques. La migration est compatible avec les anciens clients. Les fonctions de préparation conservent les permissions RLS existantes.

Aucun produit ou prix fictif n’est créé en production. Le prestataire peut créer ses tacos, burgers et wraps dans sa bibliothèque, puis les publier comme les menus actuels.

## Vérifications

- `npm run typecheck`
- `npm run build:web`
- `PGLITE_MODULE=/chemin/vers/@electric-sql/pglite/dist/index.js node --test tests/*.test.mjs`
- Servir `dist` localement avec un repli SPA vers `index.html`, puis `PLAYWRIGHT_MODULE=/chemin/vers/playwright/index.mjs UI_BASE_URL=http://127.0.0.1:4178 node tests/snackerie-web-smoke.mjs`.

Le test navigateur intercepte toutes les requêtes Supabase et bloque les autres domaines. Il vérifie les filtres parent/prestataire/admin, un élève mixte, la catégorie enregistrée lors de la création et un export CSV Snackerie conservant allergies et instructions. Les captures sont écrites dans un répertoire temporaire (ou `UI_SCREENSHOT_DIR`).

La suite PostgreSQL vérifie notamment les règles communes de quantité, paniers mixtes, paiement bancaire idempotent, crédits, annulations, accès prestataire et limite de commande à 7 h selon l’horloge métier existante.
