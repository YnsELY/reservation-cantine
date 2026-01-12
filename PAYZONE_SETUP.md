# Configuration de l'intégration PayZone

## Vue d'ensemble

Cette application utilise PayZone comme passerelle de paiement. L'intégration suit le modèle "Paywall hébergé" où les utilisateurs sont redirigés vers la page de paiement sécurisée de PayZone.

## Architecture

```
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│  App Mobile     │────▶│  Supabase Edge      │────▶│  PayZone        │
│  (React Native) │     │  Functions          │     │  Paywall        │
└─────────────────┘     └─────────────────────┘     └─────────────────┘
                                │                           │
                                │                           │
                                ▼                           │
                        ┌───────────────┐                   │
                        │  Supabase DB  │◀──────────────────┘
                        │  (PostgreSQL) │     (callback)
                        └───────────────┘
```

## Fichiers créés

### Backend (Supabase Edge Functions)

1. **`supabase/functions/payzone-init/index.ts`**
   - Initialise un paiement PayZone
   - Génère le payload et la signature SHA256
   - Sauvegarde le paiement en attente dans la base

2. **`supabase/functions/payzone-callback/index.ts`**
   - Reçoit les notifications de PayZone (webhooks)
   - Valide la signature HMAC
   - Met à jour le statut du paiement
   - Crée les réservations si paiement réussi

### Base de données

3. **`supabase/migrations/20260108100000_add_pending_payments_table.sql`**
   - Crée la table `pending_payments` pour stocker les paiements en attente

### Frontend

4. **`lib/payzone.ts`**
   - Service PayZone côté frontend
   - Communication avec les Edge Functions
   - Génération du HTML pour la WebView

5. **`app/(parent)/payment.tsx`**
   - Écran de paiement avec WebView
   - Gestion des retours (succès/échec/annulation)

6. **`app/(parent)/cart.tsx`** (modifié)
   - Intégration du bouton de paiement PayZone

## Configuration requise

### 1. Secrets Supabase

Configurez les secrets suivants dans votre projet Supabase :

```bash
# Via Supabase CLI
supabase secrets set PAYZONE_MERCHANT_ACCOUNT="votre_merchant_account"
supabase secrets set PAYZONE_SECRET_KEY="votre_secret_key"
supabase secrets set PAYZONE_URL="https://payment-sandbox.payzone.ma/paywall"
supabase secrets set PAYZONE_NOTIFICATION_KEY="votre_notification_key"
supabase secrets set APP_BASE_URL="https://votre-app.netlify.app"
```

### 2. Variables d'environnement

Les valeurs se trouvent dans le fichier `launch_credentials.inc` du dossier WinRAR fourni par PayZone :

| Variable | Description |
|----------|-------------|
| `PAYZONE_MERCHANT_ACCOUNT` | Nom du compte marchand (ex: `CHILDRENS_KITCHEN`) |
| `PAYZONE_SECRET_KEY` | Clé secrète pour signer les requêtes (paywallSecretKey) |
| `PAYZONE_URL` | URL du paywall PayZone |
| `PAYZONE_NOTIFICATION_KEY` | Clé pour valider les callbacks (notificationKey) |
| `APP_BASE_URL` | URL de base de votre application |

### 3. Déployer les Edge Functions

```bash
# Se connecter à Supabase
supabase login

# Lier le projet
supabase link --project-ref votre-project-ref

# Déployer les fonctions
supabase functions deploy payzone-init
supabase functions deploy payzone-callback
```

### 4. Appliquer la migration

```bash
supabase db push
```

### 5. Configurer le callback URL chez PayZone

Contactez PayZone pour configurer l'URL de callback globale :
```
https://votre-project-ref.supabase.co/functions/v1/payzone-callback
```

## Test

### Carte de test
- **Numéro** : `4111 1111 1111 1111`
- **Date d'expiration** : N'importe quelle date future (ex: 12/26)
- **CVV** : `000`

### Mode Sandbox
Les credentials fournis sont pour le mode test. Contactez PayZone pour les credentials de production.

## Flux de paiement

1. L'utilisateur clique sur "Payer" dans le panier
2. L'app appelle `payzone-init` qui :
   - Génère un orderId unique
   - Crée le payload avec les infos de paiement
   - Signe le payload avec SHA256
   - Sauvegarde le paiement en attente
   - Retourne les données pour le POST
3. L'app ouvre une WebView avec le formulaire POST
4. L'utilisateur est redirigé vers PayZone
5. Après paiement, PayZone :
   - Redirige l'utilisateur vers successUrl/failureUrl
   - Envoie un callback à `payzone-callback`
6. Le callback valide et crée les réservations

## Sécurité

- Les clés secrètes ne sont JAMAIS exposées côté client
- Toutes les signatures sont vérifiées
- Les callbacks utilisent HMAC SHA256
- Les timestamps limitent les attaques de replay (30 min)

## Statuts de paiement

| Statut PayZone | Action |
|----------------|--------|
| `CHARGED` | Paiement réussi → Créer réservations |
| `DECLINED` | Paiement refusé → Marquer comme échoué |
| `CANCELLED` | Annulé par l'utilisateur |
| `REFUNDED` | Remboursement → Annuler réservations |
| `ERROR` | Erreur technique |

## Support

En cas de problème :
- Vérifiez les logs Supabase : `supabase functions logs payzone-callback`
- Contactez PayZone : support@vpscorp.ma
