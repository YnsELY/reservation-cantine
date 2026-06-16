/*
  Gestion des cagnottes par l'admin.

  - is_active : permet à l'admin de désactiver/réactiver une cagnotte sans la
    supprimer. Une cagnotte désactivée n'est plus utilisable par le parent
    (filtrée dans getAvailableCredits) mais reste visible côté admin.
  - source_reservation_id devient nullable : l'admin peut créditer un parent
    manuellement (ajout d'argent) sans qu'une annulation de réservation soit à
    l'origine du crédit. La contrainte UNIQUE existante reste valide car
    PostgreSQL considère les NULL comme distincts.
*/

ALTER TABLE parent_credits
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE parent_credits
  ALTER COLUMN source_reservation_id DROP NOT NULL;
