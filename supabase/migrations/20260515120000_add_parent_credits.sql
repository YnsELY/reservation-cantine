/*
  Système de cagnotte : crédits créés à l'annulation d'une commande.

  Un crédit représente le montant remboursé sous forme de cagnotte lorsqu'un
  parent annule un repas avant 7h le jour J. Il est utilisable uniquement sur
  un autre repas dans la même semaine (Lun -> Sam), partiellement consommable,
  et expire automatiquement à la fin de la semaine (samedi 23:59 local).
*/

CREATE TABLE IF NOT EXISTS parent_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES parents(id) ON DELETE CASCADE NOT NULL,
  amount numeric(10, 2) NOT NULL CHECK (amount >= 0),
  used_amount numeric(10, 2) NOT NULL DEFAULT 0 CHECK (used_amount >= 0),
  source_reservation_id uuid REFERENCES reservations(id) NOT NULL,
  week_start_date date NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT parent_credits_used_le_amount CHECK (used_amount <= amount),
  CONSTRAINT parent_credits_unique_source UNIQUE (source_reservation_id)
);

CREATE INDEX IF NOT EXISTS idx_parent_credits_parent
  ON parent_credits(parent_id);

CREATE INDEX IF NOT EXISTS idx_parent_credits_week
  ON parent_credits(parent_id, week_start_date);

CREATE INDEX IF NOT EXISTS idx_parent_credits_active
  ON parent_credits(parent_id, expires_at)
  WHERE used_amount < amount;

ALTER TABLE parent_credits DISABLE ROW LEVEL SECURITY;
