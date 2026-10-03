# Parcours de commande parent

La nouvelle interface garde les menus et les snacks dans les mêmes tables et le même panier. La catégorie est un choix d’affichage ; elle ne change ni l’échéance, ni la confirmation du nombre de repas, ni les crédits et le paiement.

- Accueil : deux entrées, statistiques masquées uniquement pour les parents ; photos des menus publiés dans les écoles des enfants sur les sept jours accessibles.
- Catalogue : catégorie, enfant et date conservés ; une autre école recharge ses propres menus ; fermeture et absence de produits affichées explicitement.
- Détail : mêmes suppléments, notes et contrôles avant insertion. La suite du parcours apparaît uniquement après une insertion réussie. Un double clic ne crée pas un deuxième article.
- Panier : présentation par enfant **et date**, avec les suppléments des formats historiques et actuels ; calcul du paiement et reprise des paiements inchangés.
- Images : exclusivement les `image_url` des menus ; icône en cas d’image absente ou inaccessible. Les images générées pour les maquettes ne sont pas embarquées.

## Vérifications

```sh
npm run typecheck
npm run build:web
node --test tests/*.test.mjs
UI_BASE_URL=http://127.0.0.1:4179 node tests/parent-ordering-web.mjs
UI_BASE_URL=http://127.0.0.1:4179 node tests/snackerie-web-smoke.mjs
```

Servir l’export `dist` avec un serveur acceptant le repli des routes vers `index.html`. Les tests navigateur utilisent Playwright/Chromium ; les tests PostgreSQL utilisent PGlite. `PLAYWRIGHT_MODULE` et `PGLITE_MODULE` permettent d’utiliser une installation de ces outils hors du projet. `UI_SCREENSHOT_DIR` définit le dossier des captures.

Les tests navigateur interceptent tous les accès métier et bloquent les autres domaines externes. Ils utilisent des comptes fictifs, un panier en mémoire et une heure fixe. Aucun repas ni paiement réel n’est créé, même si `UI_BASE_URL` pointe vers le site déployé. Ils couvrent notamment l’ajout mixte, le consentement à un repas supplémentaire, les changements d’enfant/école/date, les suppléments, les crédits, la suppression, les erreurs d’insertion, les jours fermés et l’échéance. Les tailles contrôlées vont de 320 px à la tablette, avec un écran court pour la fenêtre de confirmation.
