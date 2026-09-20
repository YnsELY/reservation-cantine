# Réservations réglées par cagnotte — correctif du 20 septembre 2026

## Cause et correction

L'insertion dans `reservations` évaluait `reservations_insert_school`, qui lit
`children`. La policy `children_select_school_orders` ajoutée le 18 septembre
relisait directement `reservations`, provoquant l'erreur PostgreSQL `42P17`.

La migration `20260920220000_fix_school_order_rls_recursion.sql` encapsule les
lectures des anciennes commandes école dans deux fonctions PL/pgSQL
`SECURITY DEFINER`, comme les helpers prestataire existants. Les prédicats restent
liés à `current_school_id()` et aux mêmes enfant/parent et menu. RLS reste actif;
les fonctions ne sont exécutables que par le rôle `authenticated` (hors owner).
Les deux policies d'identité sont corrigées pour éviter de réintroduire le cycle.

Le client traite désormais les objets d'erreur Supabase et distingue une
validation par cagnotte d'une initialisation de paiement bancaire.

## Tests

```sh
PGLITE_MODULE=/tmp/cantine-school-validation/node_modules/@electric-sql/pglite/dist/index.js node --test tests/credit-reservation-rls.test.mjs tests/payment-errors.test.mjs
npm ci --no-audit --no-fund
npm run build:web
```

Le test PostgreSQL isolé reproduit `42P17` avant migration puis vérifie
l'insertion parent et école, le maintien des anciennes commandes après transfert,
le refus d'accès des autres familles/écoles, l'absence d'accès anonyme et la
réapplication de la migration. Aucun client réel n'est utilisé par ces tests.

## Validation en production

Migration appliquée via le SQL Editor Supabase le 20 septembre 2026.
Un `EXPLAIN` sans `ANALYZE`, dans une transaction `READ ONLY` avec le rôle
`authenticated` et l'identité du parent concerné, a confirmé que l'insertion
depuis son panier se planifie sans récursion. Transaction terminée par `ROLLBACK`.
Aucune réservation ni consommation de crédit n'a été effectuée pour ce contrôle.

L'export web réussit avec les versions du lockfile (`npm ci`). Le typecheck global
reste en échec dans des fichiers non modifiés : écrans parent/école,
`lib/notifications.ts` et fonctions Deno incluses dans la configuration TypeScript
du client. Aucun diagnostic TypeScript dans les fichiers modifiés.
