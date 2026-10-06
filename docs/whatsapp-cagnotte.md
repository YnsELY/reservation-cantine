# Confirmations de cagnotte sur WhatsApp

## Livraison du 6 octobre 2026

Cette livraison ajoute le compte à rebours et les préférences WhatsApp, avec le service d’envoi désactivé (`delivery_enabled=false`). Aucun compte Meta n’est encore raccordé et aucun envoi réel n’a été effectué. Le prestataire peut conserver WhatsApp sur son téléphone pour recevoir ; il reste à configurer un expéditeur officiel WhatsApp Business Platform.

## Parcours

Le prestataire renseigne son numéro dans Compte → Confirmations WhatsApp et active son accord de réception. Le parent dispose du même réglage dans Profil ; son téléphone existant est proposé, mais ne vaut pas consentement. Un parent sans numéro/accord ne reçoit rien ; cela n'empêche pas la notification au prestataire. Aucun SMS.

La fin atomique d'une commande utilisant une cagnotte crée un reçu dans une file privée en base. Le paiement carte complémentaire doit être confirmé. La création, la consommation de cagnotte et le reçu sont validés ensemble, ou annulés ensemble. Aucune requête WhatsApp n'est effectuée pendant le paiement.

Chaque reçu est unique par commande et destinataire. Il contient la référence, le parent, les repas et dates, le total, la cagnotte consommée et le solde disponible après l'achat. Les crédits désactivés et les montants encore réservés pour d'autres paiements sont exclus du solde disponible. Le solde est un instantané à la confirmation, pas une lecture tardive à l'envoi. Les annotations/allergies ne sont pas exportées.

Les repas transmis à un prestataire sont uniquement ceux dont il est le propriétaire (`menus.provider_id`), sans se fonder simplement sur son accès à l'école. Pour une commande multi-prestataires, les montants de cagnotte sont explicitement ceux de la commande complète : les crédits ne sont pas attribués individuellement aux lignes par le paiement existant.

## Raccordement nécessaire avant activation

1. Configurer l'expéditeur WhatsApp Business Platform (numéro d'envoi, compte Business, accès API). Les numéros destinataires peuvent garder leur application WhatsApp habituelle. Valider les éventuels frais de service avec le responsable avant de souscrire.
2. Soumettre les deux modèles ci-dessous comme confirmations transactionnelles, dans la même langue que la configuration. Leurs noms réels approuvés seront utilisés dans les secrets.
3. Installer la migration `20261005200000_wallet_whatsapp_notifications.sql` : elle laisse `delivery_enabled=false`. Déployer les deux fonctions ci-dessous avec `verify_jwt=false` : elles vérifient leur propre secret/signature, l'une pour le worker interne et l'autre pour Meta. Ne jamais appeler le worker depuis le navigateur.
4. Configurer uniquement côté serveur : `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_GRAPH_VERSION` (version supportée par le compte), `WHATSAPP_PARENT_TEMPLATE`, `WHATSAPP_PROVIDER_TEMPLATE`, `WHATSAPP_TEMPLATE_LANGUAGE` (défaut `fr`), `WHATSAPP_WORKER_SECRET`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Aucun de ces secrets ne doit être exposé dans Expo ou dans une URL.
5. Raccorder `whatsapp-webhook` aux événements messages de Meta. GET sert à vérifier l'abonnement. POST exige la signature HMAC SHA-256 valide et le bon numéro d'expéditeur. Une réponse STOP/ARRÊT/désabonnement désactive les préférences correspondantes.
6. Appeler `send-wallet-whatsapp` par un ordonnanceur serveur, une fois par minute, en POST avec l'en-tête `x-whatsapp-worker-secret`. Conserver les secrets dans un coffre serveur, jamais dans le SQL public ni le frontend. La fonction ne prend aucun destinataire dans la requête.
7. Tester avec des destinataires consentants dédiés : cagnotte seule, cagnotte + carte, absence de numéro parent, désinscription STOP, échec réseau. Vérifier réception réelle et statuts. Puis seulement activer `whatsapp_notification_settings.delivery_enabled=true`. Les écrans peuvent être publiés avant le raccordement : ils indiquent alors que le service attend son activation. Aucune ancienne commande n'est remise en file lors de l'activation.

## Modèle parent (6 paramètres de corps)

Bonjour {{1}}, votre commande {{2}} est confirmée.
Repas : {{3}}.
Total de la commande : {{4}}.
Cagnotte utilisée : {{5}}.
Cagnotte disponible après cet achat : {{6}}.
Retrouvez le détail dans votre espace parent. Répondez STOP pour arrêter ces confirmations.

## Modèle prestataire (6 paramètres de corps)

Commande confirmée pour {{1}}.
Référence : {{2}}.
Vos repas à préparer : {{3}}.
Total de la commande complète : {{4}}.
Cagnotte utilisée pour la commande complète : {{5}}.
Cagnotte disponible du parent après cet achat : {{6}}.
Retrouvez le détail dans votre espace prestataire. Répondez STOP pour arrêter ces confirmations.

L'ordre des paramètres doit rester : parent, référence, repas, total, cagnotte utilisée, solde disponible. Pour une très longue commande, le message donne les premiers repas et le nombre de lignes supplémentaires ; le détail complet reste dans l'application. Le solde et le montant utilisé ne sont jamais tronqués.

## Suivi et reprises

La file `wallet_whatsapp_outbox` est privée. `accepted` signifie que Meta a accepté l'envoi, pas que le destinataire l'a reçu. `delivery_status` indique sent/delivered/read/failed à réception du webhook. Un webhook de statut reçu avant l'enregistrement de l'identifiant d'envoi peut laisser ce champ vide ; vérifier alors l'identifiant dans les outils Meta.

Un timeout, une réponse serveur ambiguë ou un worker interrompu passent à `unknown`. Il n'y a pas de renvoi automatique de ces messages : vérifier chez Meta avant toute reprise pour éviter un doublon. Un reçu en attente est annulé si le numéro/consentement a changé, si le prestataire est désactivé, si la commande est remboursée, ou si le reçu a plus de 24 heures. Une panne WhatsApp n'annule pas la commande.

## Vérification locale

`PGLITE_MODULE=/chemin/vers/@electric-sql/pglite/dist/index.js node --test tests/wallet-whatsapp.test.mjs`

Références officielles :
- https://business.whatsapp.com/policy
- https://www.postman.com/meta/whatsapp-business-platform/request/o65u5m5/send-message-template-text

## Publication de l'interface

La livraison est construite à partir du commit de production `f435ab932b88ca97f3961802bdd98c4426b5167f`, avec une liste explicite de fichiers ajoutés ou modifiés depuis le dossier principal. Les anciens écrans et travaux locaux sans rapport avec cette livraison ne sont pas publiés. Le dossier `.expo/production-build` est un artefact de compilation ignoré par Git, pas un nouveau checkout de travail. Les modifications non publiées du dossier principal sont conservées.

Vérifications effectuées : 13 tests WhatsApp (SQL avec vrai PostgreSQL PGlite, consentement, propriété des repas, soldes, rollback, unicité, worker, signatures Meta, STOP) ; 39 tests de non-régression paiement/échéance. Aperçu du composant réel testé à 320 et 390 px, sans débordement, et formulaire testé avec faux backend pour numéro invalide et sauvegarde. Aucun parent réel contacté.

Le contrôle TypeScript ciblé des écrans modifiés et de leurs dépendances termine avec zéro diagnostic. Deux options de notification Expo (`shouldShowBanner` et `shouldShowList`) ont été complétées pour respecter le type de la version installée.

## Adresses de raccordement

- Application : https://childrens-kitchen.com
- Webhook Meta : `https://wreusophfpedauznrjfl.supabase.co/functions/v1/whatsapp-webhook`
- Worker interne : `https://wreusophfpedauznrjfl.supabase.co/functions/v1/send-wallet-whatsapp`

Le numéro d’expédition central est distinct des numéros de réception saisis dans les profils. Pour démarrer simplement, utiliser un numéro d’envoi dédié capable de recevoir le code de validation Meta. Ne pas supprimer un compte WhatsApp existant pour tenter de le connecter ; vérifier auparavant l’éligibilité au parcours de coexistence si le même numéro doit être conservé.
