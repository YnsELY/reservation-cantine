/*
  Ajoute la colonne applied_credits aux paiements en attente pour transporter
  l'usage prévu de la cagnotte jusqu'au callback Payzone, qui consommera les
  crédits une fois le paiement confirmé.

  Format : [{ "credit_id": uuid, "amount": number }, ...]
*/

ALTER TABLE pending_payments
  ADD COLUMN IF NOT EXISTS applied_credits jsonb DEFAULT '[]'::jsonb;
