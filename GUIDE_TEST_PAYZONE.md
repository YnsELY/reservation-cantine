# Guide de Test - Intégration PayZone

## ✅ Checklist avant les tests

### 1. Secrets Supabase configurés
- [x] `PAYZONE_MERCHANT_ACCOUNT` = "childrens_kitchen_Test"
- [x] `PAYZONE_SECRET_KEY` = "k8P1bGukoJfYNmyU"
- [x] `PAYZONE_URL` = "https://payment-sandbox.payzone.ma/pwthree/launch"
- [x] `PAYZONE_NOTIFICATION_KEY` = "3Vlm2S3IkBO7BuiO"
- [x] `APP_BASE_URL` = "https://childrens-kitchen.netlify.app"

### 2. Edge Functions déployées
- [x] `payzone-init` déployée
- [x] `payzone-callback` déployée

### 3. Base de données
- [x] Migration `pending_payments` appliquée

### 4. Application
- [x] Dépendances installées
- [x] Code modifié pour PayZone

---

## 🧪 Scénario de test complet

### Étape 1 : Préparer le panier
1. Lancez l'application : `npm run dev`
2. Connectez-vous en tant que parent
3. Allez dans **"Réservation"**
4. Ajoutez plusieurs repas au panier pour différents enfants
5. Vérifiez que le total s'affiche correctement

### Étape 2 : Initier le paiement
1. Allez dans **"Mon Panier"**
2. Vérifiez que tous les articles sont présents
3. Cliquez sur **"Payer par carte bancaire"**
4. Vérifiez que le bouton affiche bien l'icône de cadenas 🔒
5. Un écran de chargement devrait apparaître

### Étape 3 : WebView PayZone
1. L'application devrait ouvrir une WebView
2. Vous devriez être redirigé vers la page PayZone
3. La page devrait afficher :
   - Le montant correct (en MAD)
   - La description des articles
   - Un formulaire de carte bancaire

### Étape 4 : Paiement test
Utilisez les informations de test PayZone :

```
Numéro de carte : 4111 1111 1111 1111
Date d'expiration : 12/26 (ou toute date future)
CVV : 000
```

### Étape 5 : Vérifier le succès
1. Après la saisie, cliquez sur **"Payer"**
2. Vous devriez voir un écran de succès ✅
3. Cliquez sur **"Voir mes réservations"**
4. Vérifiez que les réservations apparaissent dans l'historique
5. Retournez au panier → Il devrait être vide

---

## 🔍 Points à vérifier

### Dans l'application
- [ ] Le panier se vide après un paiement réussi
- [ ] Les réservations apparaissent dans l'historique avec `payment_status: 'paid'`
- [ ] Les réservations contiennent le bon `payment_intent_id` de PayZone

### Dans Supabase
1. Allez dans **Table Editor** → `pending_payments`
2. Vous devriez voir un enregistrement avec :
   - `status` = "completed"
   - `payzone_transaction_id` rempli
   - `payzone_status` = "CHARGED"

3. Allez dans **Table Editor** → `reservations`
4. Les nouvelles réservations devraient avoir :
   - `payment_status` = "paid"
   - `payment_intent_id` non null

### Dans les logs Supabase
1. Allez dans **Edge Functions** → Logs
2. Vérifiez les logs de `payzone-callback`
3. Vous devriez voir : "Payment XXX completed successfully"

---

## ❌ Test d'échec de paiement

### Tester un paiement refusé
Pour simuler un échec (si PayZone le permet en test) :
1. Utilisez une carte invalide ou annulez le paiement
2. Vous devriez voir un écran d'erreur avec l'icône ❌
3. Le bouton **"Réessayer"** devrait fonctionner
4. Les articles doivent rester dans le panier

### Vérifier dans Supabase
- Dans `pending_payments`, le statut devrait être "failed"
- Aucune réservation ne devrait être créée

---

## 🐛 Dépannage

### Erreur "Configuration PayZone manquante"
➡️ Les secrets Supabase ne sont pas configurés correctement
```bash
supabase secrets list  # Vérifier les secrets
```

### Erreur "Signature invalide"
➡️ La `PAYZONE_NOTIFICATION_KEY` est incorrecte
- Vérifiez que vous avez bien utilisé `3Vlm2S3IkBO7BuiO`

### WebView ne se charge pas
➡️ Problème de CORS ou d'URL
- Vérifiez que `PAYZONE_URL` est correct
- Vérifiez les logs de `payzone-init`

### Le callback ne fonctionne pas
➡️ PayZone ne peut pas atteindre votre callback
- Assurez-vous que l'URL du callback est publique
- Format attendu : `https://YOUR-PROJECT.supabase.co/functions/v1/payzone-callback`
- Contactez PayZone pour configurer cette URL

### Paiement en attente indéfiniment
➡️ Le callback n'a pas été reçu
1. Vérifiez les logs de `payzone-callback`
2. Vérifiez que la signature est correcte
3. Testez manuellement l'API de récupération :
   ```bash
   curl https://YOUR-PROJECT.supabase.co/functions/v1/payzone-callback \
     -H "x-callback-signature: test" \
     -d '{"status":"CHARGED","orderId":"test"}'
   ```

---

## 📊 URLs importantes

### Supabase
- Dashboard : https://app.supabase.com
- Edge Functions : `/project/YOUR-PROJECT/functions`
- Database : `/project/YOUR-PROJECT/editor`
- Logs : `/project/YOUR-PROJECT/logs/edge-functions`

### PayZone
- Support : support@vpscorp.ma
- Contact : kanane@vpscorp.ma

---

## 🚀 Passer en production

Une fois les tests réussis :

1. **Contacter PayZone** pour obtenir les credentials de production
2. **Mettre à jour les secrets** :
   ```bash
   supabase secrets set PAYZONE_MERCHANT_ACCOUNT="childrens_kitchen_Prod"
   supabase secrets set PAYZONE_SECRET_KEY="production_key"
   supabase secrets set PAYZONE_URL="https://payment.payzone.ma/pwthree/launch"
   supabase secrets set PAYZONE_NOTIFICATION_KEY="production_notification_key"
   ```
3. **Redéployer les fonctions** :
   ```bash
   supabase functions deploy payzone-init
   supabase functions deploy payzone-callback
   ```
4. **Tester avec une vraie carte** (petit montant)
5. **Surveiller les logs** pendant les premiers paiements

---

## ✅ Checklist de lancement
- [ ] Tests sandbox réussis
- [ ] Credentials de production reçus
- [ ] Secrets mis à jour
- [ ] Edge Functions redéployées
- [ ] Test avec vraie carte effectué
- [ ] Monitoring des logs actif
- [ ] CGV PayZone ajoutées au footer
- [ ] Logo PayZone ajouté à l'app

Bon test ! 🎉
