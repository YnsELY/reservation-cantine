# Écoles et changements d’établissement

## Mise en service

Appliquer `supabase/migrations/20260918120000_child_school_changes.sql` avant de publier le client. La migration n’a pas été exécutée sur une base distante pendant cette intervention.

- La Vertu est reconnue par son nom (insensible à la casse, espaces ou tiret entre « La » et « Vertu »). Maternelle et élémentaire sont autorisées, jusqu’au CM2.
- Le compte parent propose « Modifier le profil / changer d’école » pour chaque enfant. Une nouvelle affiliation utilise le code d’accès, comme le parcours existant.
- Le changement et la suppression du panier de cet enfant sont atomiques en base. Les autres enfants, les réservations et les paiements existants ne sont pas modifiés.
- Les commandes, les statistiques et les permissions école suivent désormais l’école du menu réservé, même après un transfert. Les listes d’élèves continuent à suivre l’école actuelle.
- Une ancienne classe incompatible à La Vertu doit être corrigée lors de l’enregistrement du formulaire ; la migration ne réécrit pas les données existantes.

## Tests exécutables

Node 24 (support natif des fichiers TypeScript) :

```sh
node --test tests/school-grades.test.mjs
```

Test PostgreSQL isolé avec PGlite (aucune connexion à Supabase) :

```sh
npm install --prefix /tmp/cantine-school-validation --no-audit --no-fund @electric-sql/pglite@0.5.8
PGLITE_MODULE=/tmp/cantine-school-validation/node_modules/@electric-sql/pglite/dist/index.js node --test tests/child-school-changes.test.mjs
```

Les tests vérifient les classes primaire/secondaire, les variantes du nom, les transferts autorisés/refusés, l’absence de suppression de panier en cas d’échec, la conservation des réservations et du panier des frères/sœurs, et la visibilité des anciennes commandes par la bonne école sous RLS.

## Validation du 18 septembre 2026

- Tests métier : 3/3 réussis.
- Test PostgreSQL, trigger et politiques RLS : réussi.
- Export web Expo : réussi dans une copie temporaire des sources avec des dépendances réinstallées selon `package.json`.
- Le dossier original comporte des fichiers indisponibles localement (attribut macOS `dataless`), dont `.git/index` et `package-lock.json`. Les commandes Git et les vérifications avec les dépendances originales se bloquaient ; le lockfile n’a pas été modifié. L’export temporaire ne constitue donc pas une validation des versions exactes verrouillées.
- TypeScript dans la copie temporaire : aucune erreur dans les fichiers modifiés ; 6 erreurs dans des fichiers non modifiés (`app/(parent)/index.tsx`, `app/(parent)/my-meals.tsx`, `app/(school)/student-details.tsx`, `lib/notifications.ts`).
- Lint global : 90 erreurs et 136 avertissements, notamment apostrophes JSX et dépendances des hooks dans le code existant. Aucun nettoyage global hors périmètre.
- Pas de test de bout en bout avec un compte Supabase réel, ni de déploiement distant.

## Contrôle après application de la migration

1. Ajouter/modifier un enfant à La Vertu : aucune classe après CM2 ; vérifier qu’une autre école conserve collège et lycée.
2. Depuis le compte parent, sélectionner une autre école affiliée ou ajouter son code, puis enregistrer. Vérifier l’école/classe affichées au retour et les menus proposés.
3. Avec deux enfants et des paniers distincts, transférer un seul enfant : seul son panier disparaît.
4. Avec une commande existante, vérifier qu’elle reste dans l’ancienne école et chez le prestataire correspondant, et n’apparaît pas dans la nouvelle école.
5. Tester un code invalide, une affiliation inactive et un échec réseau : aucun message de succès en cas d’échec de sauvegarde.
