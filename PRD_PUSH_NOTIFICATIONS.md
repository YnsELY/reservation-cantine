# PRD - Système de Notifications Push
## Child's Kitchen Reservation System

**Date:** 28 mars 2026  
**Version:** 1.0  
**Statut:** À Implémenter

---

## 1. Vue d'ensemble

Ce document définit le système de notifications push pour l'application Child's Kitchen. Les notifications push permettront aux utilisateurs (parents, écoles, prestataires) de rester informés en temps réel des événements importants sans avoir besoin de consulter l'app régulièrement.

**Objectifs:**
- Améliorer l'engagement des utilisateurs
- Informer en temps réel des changements importants
- Réduire les erreurs de communication
- Augmenter les taux de réservation et de paiement

---

## 2. Architecture Technique

### Stack recommandé:
- **Service**: Firebase Cloud Messaging (FCM) ou Expo Push Notifications
- **Backend**: Supabase Functions (Edge Functions) pour déclencher les notifications
- **Stockage des tokens**: Table `user_push_tokens` en Supabase
- **Gestion des consentements**: Paramètres utilisateur stockés localement et en base

### Base de données requise:
```sql
CREATE TABLE user_push_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  user_type VARCHAR (20), -- 'parent', 'school', 'provider'
  push_token TEXT NOT NULL UNIQUE,
  device_type VARCHAR (20), -- 'ios', 'android', 'web'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  last_used_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES parents/schools/providers(id)
);

CREATE TABLE notification_logs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  notification_type VARCHAR (100),
  title TEXT,
  body TEXT,
  data JSONB,
  status VARCHAR (20), -- 'sent', 'delivered', 'failed'
  created_at TIMESTAMP,
  sent_at TIMESTAMP
);
```

---

## 3. Notifications par Utilisateur

### 3.1 PARENT

#### A. Commandes & Réservations

| # | Notification | Déclencheur | Titre | Body | Données | Priorité | Délai |
|---|---|---|---|---|---|---|---|
| P1 | Réservation confirmée | Après création de réservation | "Réservation confirmée ✓" | "Votre réservation pour {child_name} le {date} a été confirmée." | `reservation_id, child_id, date, total_price` | Haute | Immédiat |
| P2 | Rappel de commande | 24h avant la date | "Rappel: Commande demain" | "{child_name} : {meal_name} à {price} DH" | `reservation_id, child_id` | Haute | 24h avant |
| P3 | Menu indisponible | Menu supprimé/annulé | "Menu annulé" | "Le menu '{meal_name}' pour {date} n'est plus disponible. Remboursement appliqué." | `reservation_id, refund_amount` | Haute | Immédiat |

#### B. Paiement

| # | Notification | Déclencheur | Titre | Body | Données | Priorité | Délai |
|---|---|---|---|---|---|---|---|
| P4 | Paiement réussi | Webhook Payzone CHARGED | "Paiement confirmé 💳" | "Paiement de {amount} DH reçu. Référence: {order_id}" | `order_id, amount, payment_method` | Haute | Immédiat |
| P5 | Paiement échoué | Webhook Payzone DECLINED | "Paiement échoué ⚠️" | "Votre paiement de {amount} DH a été refusé. Raison: {reason}" | `order_id, reason` | Haute | Immédiat |
| P6 | Paiement en attente 3DS | Webhook Payzone CHARGE_PENDING | "Vérification en cours" | "Votre paiement est en attente de vérification bancaire (3DS). Veuillez compléter la vérification." | `order_id` | Moyenne | Immédiat |
| P7 | Rappel de paiement | Paiement pending depuis 2h | "Paiement en attente" | "Vous avez un paiement de {amount} DH en attente. Valider avant {deadline}." | `order_id, amount` | Moyenne | +2h |
| P8 | Panier expirant | Panier inactif depuis 30 min | "Votre panier va expirer" | "Votre panier contient {item_count} article(s) pour {total} DH. Confirmez votre commande avant qu'il n'expire." | `cart_value, item_count` | Basse | +30 min |

#### C. Communications Professeur/École

| # | Notification | Déclencheur | Titre | Body | Données | Priorité | Délai |
|---|---|---|---|---|---|---|---|
| P9 | Nouveau menu disponible | Menu créé pour la classe | "Nouveaux menus 🍽️" | "{school_name} a ajouté {count} nouveau(x) menu(x) pour {child_name}." | `school_id, child_id, menu_ids` | Moyenne | Immédiat |
| P10 | Message de l'école | Message envoyé (feature future) | "Message de {school_name}" | "{message_preview}..." | `message_id, sender_id` | Moyenne | Immédiat |
| P11 | Allergie ou restriction signalée | Parent modifie profil enfant | "Profil mis à jour" | "Les restrictions alimentaires de {child_name} ont été mises à jour." | `child_id` | Moyenne | Immédiat |

#### D. Comptes & Profil

| # | Notification | Déclencheur | Titre | Body | Données | Priorité | Délai |
|---|---|---|---|---|---|---|---|
| P12 | Nouvel enfant ajouté | Après création enfant | "Enfant enregistré ✓" | "{child_name} a été enregistré avec succès. Vous pouvez maintenant faire des réservations." | `child_id` | Basse | Immédiat |
| P13 | Connexion nouvelle session | Connexion depuis nouvel appareil/IP | "Nouvelle connexion" | "Connexion depuis {device_type} à {time}. Si ce n'est pas vous, sécurisez votre compte." | `session_id, device_info` | Moyenne | Immédiat |

---

### 3.2 SCHOOL (École)

#### A. Commandes & Réservations

| # | Notification | Déclencheur | Titre | Body | Données | Priorité | Délai |
|---|---|---|---|---|---|---|---|
| S1 | Nouvelle réservation reçue | Parent crée réservation | "Nouvelle commande 📋" | "{child_name} ({grade}) a réservé {meal_name} pour {date}." | `reservation_id, child_id, grade, date` | Haute | Immédiat |
| S2 | Réservation en attente de paiement | Réservation créée avant paiement | "Réservation en attente" | "{child_name} a réservé mais le paiement n'est pas confirmé. Montant: {amount} DH" | `reservation_id, amount` | Moyenne | Immédiat |
| S3 | Annulation de réservation | Parent annule réservation | "Commande annulée" | "{child_name} a annulé sa réservation pour {date}. Repas: {meal_name}" | `reservation_id, child_id, date` | Moyenne | Immédiat |
| S4 | Résumé du jour | Chaque matin à 6h | "Résumé de la journée" | "Vous avez {confirmed_count} réservations confirmées et {pending_count} en attente pour aujourd'hui." | `date, stats` | Moyenne | 06:00 |
| S5 | Rappel préparation | 2h avant service | "Préparation - {date}" | "Vous avez {count} repas à préparer aujourd'hui. Détails en app." | `date, reservation_ids` | Haute | -2h |

#### B. Paiements & Finances

| # | Notification | Déclencheur | Titre | Body | Données | Priorité | Délai |
|---|---|---|---|---|---|---|---|
| S6 | Paiement reçu | Webhook Payzone CHARGED | "Paiement reçu 💰" | "Paiement de {amount} DH pour {count} réservation(s). Référence: {order_id}" | `order_id, amount, count` | Haute | Immédiat |
| S7 | Rapport financier quotidien | Chaque jour à 20h | "Résumé financier" | "Chiffre du jour: {total_amount} DH ({count} transactions)" | `date, total, count` | Basse | 20:00 |

#### C. Gestion des Menus & Prestataires

| # | Notification | Déclencheur | Titre | Body | Données | Priorité | Délai |
|---|---|---|---|---|---|---|---|
| S8 | Nouveau menu du prestataire | Prestataire ajoute menu | "Nouveau menu 🍽️" | "{provider_name} a ajouté '{meal_name}' pour {date}." | `menu_id, provider_id, date` | Moyenne | Immédiat |
| S9 | Menu supprimé | Prestataire supprime menu | "Menu supprimé" | "Le menu '{meal_name}' pour {date} a été supprimé par {provider_name}." | `menu_id, date, provider_name` | Moyenne | Immédiat |
| S10 | Accès prestataire révoqué | Admin révoque accès | "Prestataire supprimé" | "L'accès de {provider_name} a été révoqué." | `provider_id` | Haute | Immédiat |

#### D. Communications & Alertes

| # | Notification | Déclencheur | Titre | Body | Données | Priorité | Délai |
|---|---|---|---|---|---|---|---|
| S11 | Allergie enfant signalée | Parent met à jour allergie | "⚠️ Allergie signalée" | "{child_name} ({grade}) a une allergie: {allergen}. Vérifiez avant de servir." | `child_id, grade, allergen` | Haute | Immédiat |
| S12 | Restriction alimentaire mise à jour | Parent modifie restrictions | "Restriction mise à jour" | "{child_name} : {restriction}. Veuillez en tenir compte." | `child_id, restriction` | Moyenne | Immédiat |

---

### 3.3 PROVIDER (Prestataire)

#### A. Accès & Écoles

| # | Notification | Déclencheur | Titre | Body | Données | Priorité | Délai |
|---|---|---|---|---|---|---|---|
| Pr1 | Accès école accordé | Admin ajoute accès | "Nouvel accès 🔓" | "Vous avez désormais accès à {school_name}." | `school_id, school_name` | Moyenne | Immédiat |
| Pr2 | Accès école révoqué | Admin révoque accès | "Accès révoqué" | "Votre accès à {school_name} a été révoqué." | `school_id, school_name` | Haute | Immédiat |
| Pr3 | Nouvelle école demandant accès | École envoie demande | "Demande d'accès" | "{school_name} souhaite accéder à vos menus. Accepter ou refuser?" | `school_id, request_id` | Moyenne | Immédiat |

#### B. Commandes & Réservations

| # | Notification | Déclencheur | Titre | Body | Données | Priorité | Délai |
|---|---|---|---|---|---|---|---|
| Pr4 | Commande pour menu | Parent réserve un menu | "Commande reçue 📋" | "{count} x {meal_name} pour {school_name} le {date}." | `reservation_ids, menu_id, school_id, date` | Haute | Immédiat |
| Pr5 | Résumé des commandes du jour | Chaque matin à 6h | "Commandes d'aujourd'hui" | "Vous avez {total_count} commande(s) confirmées. Détails en app." | `date, total_count` | Moyenne | 06:00 |
| Pr6 | Rappel préparation | 2h avant service | "Préparation - {date}" | "{total_count} repas à préparer pour {school_count} école(s)." | `date, reservation_ids` | Haute | -2h |

#### C. Paiements & Finances

| # | Notification | Déclencheur | Titre | Body | Données | Priorité | Délai |
|---|---|---|---|---|---|---|---|
| Pr7 | Paiement reçu | Webhook Payzone CHARGED | "Paiement reçu 💰" | "Paiement de {amount} DH pour {count} repas. Référence: {order_id}" | `order_id, amount, count` | Haute | Immédiat |
| Pr8 | Rapport financier | Chaque vendredi à 18h | "Rapport hebdomadaire" | "Chiffre de la semaine: {total_amount} DH ({transaction_count} transactions)" | `week_date, total, count` | Basse | Vendredi 18:00 |

#### D. Gestion des Menus

| # | Notification | Déclencheur | Titre | Body | Données | Priorité | Délai |
|---|---|---|---|---|---|---|---|
| Pr9 | Menu bientôt expirant | Menu date < 7 jours | "Menu bientôt expiré" | "'{meal_name}' expire dans {days} jour(s). Créer une nouvelle version?" | `menu_id, days` | Basse | -7 jours |
| Pr10 | Tous les menus expirés | Plus aucun menu à venir | "Aucun menu à venir" | "Tous vos menus ont expiré. Créez de nouveaux menus pour les écoles." | `school_ids` | Moyenne | Immédiat |

---

### 3.4 ADMIN (Administration)

#### A. Gestion des Utilisateurs

| # | Notification | Déclencheur | Titre | Body | Données | Priorité | Délai |
|---|---|---|---|---|---|---|---|
| A1 | Nouvel utilisateur inscrit | Inscription parent/école | "Nouvel utilisateur 👤" | "{user_name} ({user_type}) s'est inscrit. Email: {email}" | `user_id, user_type, email` | Basse | Immédiat |
| A2 | Demande d'accès prestataire | Prestataire demande accès | "Demande d'accès prestataire" | "{provider_name} demande l'accès à {school_name}." | `provider_id, school_id` | Moyenne | Immédiat |

#### B. Alertes Système

| # | Notification | Déclencheur | Titre | Body | Données | Priorité | Délai |
|---|---|---|---|---|---|---|---|
| A3 | Erreur de paiement | Webhook Payzone DECLINED | "Paiement échoué" | "Paiement de {amount} DH échoué. {order_id}. Raison: {reason}" | `order_id, reason` | Haute | Immédiat |
| A4 | Timeout 3DS | Payment_pending depuis 10 min | "3DS non validé" | "Paiement {order_id} en attente 3DS depuis plus de 10 min." | `order_id` | Moyenne | +10 min |
| A5 | Service down | Health check échoue | "⚠️ Service indisponible" | "Le service de paiement n'est pas accessible." | `service_name, error` | Haute | Immédiat |

#### C. Rapports & Analytics

| # | Notification | Déclencheur | Titre | Body | Données | Priorité | Délai |
|---|---|---|---|---|---|---|---|
| A6 | Rapport quotidien | Chaque jour à 22h | "Rapport du jour" | "Transactions: {count}, Revenu: {total} DH, Utilisateurs actifs: {active_users}" | `date, stats` | Basse | 22:00 |

---

## 4. Cas d'Usage Avancés

### 4.1 Notification Groupée
Lorsque plusieurs réservations arrivent rapidement pour une même école:
- Au lieu d'envoyer 5 notifications → envoyer 1 notification groupée après 5 minutes
- "5 nouvelles réservations pour {school_name}"

### 4.2 Notification Intelligente basée sur le Contexte
- **Parent actif** : Pas de rappel panier expirant (déjà dans l'app)
- **Parent inactif** : Rappels + notifications agressives
- **Heure sensible** : Pas de notification entre 21h-8h sauf urgence

### 4.3 Préférences Utilisateur
Chaque utilisateur peut:
- Désactiver certains types de notifications
- Choisir les heures de notification
- Préférer email/SMS/push selon le type
- Choisir la langue (FR/AR)

---

## 5. Règles de Livraison

| Type de Notification | Retry | Timeout | Max Envois |
|---|---|---|---|
| Paiement (P4, P5, Pr7) | 3x après 5min | 1h | 1 |
| Réservation (P1, S1, Pr4) | 2x après 5min | 30min | 1 |
| Rappel (P7, S4, Pr5) | 1x après 5min | 24h | 1 |
| Rappel panier (P8) | Aucun | 2h | 1 |
| Message école (P10) | 3x après 5min | 12h | 1 |

---

## 6. Analytics & Monitoring

**Métriques à tracker:**
- Taux de livraison par type
- Taux d'ouverture (click-through rate)
- Conversions après notification (paiement complété, réservation faite)
- Taux de désactivation
- Latence d'envoi (target: <5 secondes)

**Dashboard:**
- Nombre total envoyé/jour
- État de livraison (envoyé/livré/échoué)
- Top 5 notifications les plus cliquées

---

## 7. Implémentation - Stratégie 2 Phases

### 🟢 **PHASE 1: Expo Push Notifications (Développement)**
*Durée: 3-4 semaines | Technologie: Expo Notifications API*

#### Phase 1.1 (Semaine 1):
- [ ] Mise en place Expo Notifications API
- [ ] Table `user_push_tokens` (avec colonne `provider: 'expo'`)
- [ ] Table `notification_logs`
- [ ] Service pour enregistrer/gérer tokens Expo
- [ ] Edge Function pour envoyer via Expo API

#### Phase 1.2 (Semaine 2):
- [ ] Notifications Paiement (P4, P5, Pr7)
- [ ] Notifications Réservation Parent (P1, P2)
- [ ] Notifications Réservation School (S1, S2)
- [ ] Notifications prestataire (Pr4, Pr5)

#### Phase 1.3 (Semaine 3):
- [ ] Toutes les notifications restantes (71 total)
- [ ] Préférences utilisateur (opt-in/opt-out)
- [ ] Gestion des tokens expirés

#### Phase 1.4 (Semaine 4):
- [ ] Tests complets avec Expo Go
- [ ] Feedback utilisateurs
- [ ] Métriques analytics (livraison, ouverture)
- [ ] **Validation GO/NO-GO pour Phase 2**

**Critères d'acceptation Phase 1:**
- ✅ Toutes les 71 notifications envoyées correctement
- ✅ Taux de livraison > 95%
- ✅ Pas de crash app
- ✅ Utilisateurs activent notifications volontairement
- ✅ Analytics collectées correctement

---

### 🔵 **PHASE 2: Notifications Natives (Production)**
*Durée: 2-3 semaines | Technologie: Firebase + APNs*

**Condition préalable:** Phase 1 validée ✅

#### Phase 2.1 (Semaine 5):
- [ ] Mise en place Firebase Cloud Messaging (Android)
- [ ] Mise en place Apple Push Notifications (iOS)
- [ ] Certificats + configuration serveur
- [ ] EAS Build pour tester sur devices réels

#### Phase 2.2 (Semaine 6):
- [ ] Migration code: Expo → Firebase/APNs
- [ ] Mise à jour tokens en DB (`provider: 'fcm'` ou `'apns'`)
- [ ] Backward compatibility avec Expo tokens
- [ ] Edge Functions pour Firebase API

#### Phase 2.3 (Semaine 7):
- [ ] Tests sur devices iOS + Android
- [ ] Gestion tokens expirés (FCM/APNs)
- [ ] Analytics natives (Firebase Console)
- [ ] Deep linking + navigation depuis notification

**Transition Phase 1 → Phase 2:**
```typescript
// Pendant la transition, supporter les deux
async function updateUserToken() {
  // Si app en dev: Expo token
  if (__DEV__) {
    const expoToken = await Notifications.getExpoPushTokenAsync();
    await saveToken(expoToken.data, 'expo');
  }
  
  // Si app en prod: Firebase/APNs token
  if (!__DEV__) {
    const nativeToken = await messaging().getToken();
    await saveToken(nativeToken, 'fcm');
  }
}
```

---

## 8. Budget & Ressources

### Phase 1 (Expo Notifications)
**Coûts:**
- Expo Notifications: GRATUIT
- Stockage push tokens: ~100MB sur Supabase
- Edge Functions: ~5$ / mois
- **Total Phase 1: ~5$ / mois**

**Ressources:**
- 1 Backend Developer: 40-50 heures
- 1 Frontend Developer: 15-20 heures
- 1 QA: 10-15 heures
- **Total: ~75 heures**

---

### Phase 2 (Firebase + APNs)
**Coûts:**
- Firebase Cloud Messaging: GRATUIT (jusqu'à 500M notifications/mois)
- Apple Developer Account: ~99$/an (si pas déjà payé)
- EAS Build: ~0.25$ par build (~20-30 builds)
- Stockage push tokens: ~100MB sur Supabase
- Edge Functions: ~10-15$ / mois
- **Total Phase 2: ~20-25$ / mois**

**Ressources:**
- 1 Backend Developer: 30-40 heures
- 1 Frontend Developer: 15-20 heures
- 1 QA: 10-15 heures
- 1 DevOps: 10-15 heures (certificats, configs)
- **Total: ~70-80 heures**

---

### Budget Total (Phase 1 + 2)
- **Développement:** ~150 heures (~4 semaines)
- **Infrastructure:** ~30-50$ / mois
- **Matériel:** Apple Developer ($99/an si nouveau)

---

## 9. Risques & Mitigations

### Phase 1 (Expo)
| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Token expiré Expo | Moyenne | Moyen | Nettoyage hebdomadaire |
| Rate limiting Expo API | Basse | Moyen | Batch requests, queue système |
| Service Expo down | Très basse | Critique | Fallback email (future) |
| Tokens non collectés (opt-in) | Moyenne | Moyen | Rappels dans l'app |

### Phase 2 (Firebase/APNs)
| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Certificats APNs expirés | Moyenne | Critique | Alertes 30j avant expiration |
| Token expiré FCM/APNs | Haute | Moyen | Nettoyage mensuel |
| Transition rupture service | Basse | Élevé | Période transition 2 semaines |
| Certificats iOS mal configurés | Moyenne | Critique | Documentation + pair programming |
| Non-conformité RGPD | Faible | Critique | Consentement explicite + opt-out facile |

---

## 10. Conformité & Légal

- ✅ RGPD: Consentement explicite requis avant premier envoi
- ✅ Droit à l'oubli: Suppression tokens sur demande
- ✅ Transparence: Logs conservés 90 jours max
- ✅ Accessibilité: Notifications accessibles (texte + audio)

---

## 10. Roadmap Visuelle

```
PHASE 1: Expo Notifications (Semaines 1-4)
├─ Setup + Infrastructure
├─ Notifications Critiques (Paiements, Réservations)
├─ Notifications Secondaires
├─ Tests & Validation
└─ ✅ GO/NO-GO Decision

         ↓ (SI VALIDATION OK)

PHASE 2: Notifications Natives (Semaines 5-7)
├─ Firebase + APNs Setup
├─ Migration Code
├─ Tests Devices Réels
└─ 🚀 Production Ready
```

---

## 11. Checklist Pré-Lancement Phase 1

### Infrastructure
- [ ] Base de données `user_push_tokens` créée
- [ ] Table `notification_logs` créée
- [ ] Edge Function Expo créée et testée
- [ ] Supabase Secrets configurés

### Frontend
- [ ] Import `expo-notifications`
- [ ] Écran de permission notification
- [ ] Service d'enregistrement token
- [ ] Listener de notification
- [ ] Gestion deep linking

### Backend
- [ ] API endpoint `/register-token` (POST)
- [ ] API endpoint `/send-notification` (POST)
- [ ] Queue système pour notifications
- [ ] Logging complet

### Tests
- [ ] Test manual Expo Go (iOS + Android)
- [ ] Test timeout/retry
- [ ] Test opt-in/opt-out
- [ ] Test analytics
- [ ] Load test 1000 notifications/min

### Documentation
- [ ] Guide token management
- [ ] Troubleshooting Expo
- [ ] Instructions Phase 2

---

## Approuvé par:
- [ ] Product Owner
- [ ] Tech Lead
- [ ] Responsable sécurité

---

## Notes de Transition Phase 1 → Phase 2

**Ce qu'on garde:**
- Schema DB (`user_push_tokens`, `notification_logs`)
- Logique métier (quand envoyer quoi)
- Préférences utilisateur
- Analytics

**Ce qu'on change:**
- Source token: `Expo API` → `Firebase/APNs`
- Edge Function: Expo endpoint → Firebase endpoint
- Certificats iOS: Générer APNs certs
- Dépendances: `expo-notifications` → `react-native-firebase`

**Backward compatibility:**
- Support les deux types de tokens pendant transition (2 semaines)
- Migrer progressivement les devices
- Rollback possible si problème
