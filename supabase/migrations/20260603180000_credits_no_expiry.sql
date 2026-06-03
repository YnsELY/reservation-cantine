/*
  Cagnotte : crédits sans deadline, utilisables n'importe quand / n'importe quelle semaine.

  Contexte
  --------
  Avant : un crédit d'annulation était lié à une semaine de validité
  (`week_start_date`) et expirait (`expires_at`), et n'était utilisable que sur un
  repas de cette même semaine. De plus, la création du crédit échouait
  silencieusement à l'annulation si le schéma n'était pas complet
  (ex. `meal_week_start_date` absente) → commande annulée mais cagnotte vide.

  Changements
  -----------
  - `week_start_date` et `expires_at` ne sont plus utilisées par l'app : rendues
    NULLABLE pour que la création d'un crédit n'ait plus à les fournir.
  - `meal_week_start_date` (semaine du repas) reste utilisée uniquement pour la
    limite MAX_CANCELLATIONS_PER_WEEK : on garantit son existence (+ nullable).
  - RLS recréée ici (idempotente, self-contained, sans dépendre de
    current_parent_id()) pour que l'INSERT du crédit par le parent fonctionne même
    si la migration RLS globale n'a pas été appliquée. Les policies admin
    existantes ne sont pas touchées.
*/

ALTER TABLE public.parent_credits ADD COLUMN IF NOT EXISTS meal_week_start_date date;
ALTER TABLE public.parent_credits ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE public.parent_credits ALTER COLUMN week_start_date DROP NOT NULL;
ALTER TABLE public.parent_credits ALTER COLUMN meal_week_start_date DROP NOT NULL;

ALTER TABLE public.parent_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parent_credits_select_self" ON public.parent_credits;
CREATE POLICY "parent_credits_select_self"
  ON public.parent_credits FOR SELECT
  TO authenticated
  USING (parent_id IN (SELECT id FROM public.parents WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "parent_credits_insert_self" ON public.parent_credits;
CREATE POLICY "parent_credits_insert_self"
  ON public.parent_credits FOR INSERT
  TO authenticated
  WITH CHECK (parent_id IN (SELECT id FROM public.parents WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "parent_credits_update_self" ON public.parent_credits;
CREATE POLICY "parent_credits_update_self"
  ON public.parent_credits FOR UPDATE
  TO authenticated
  USING (parent_id IN (SELECT id FROM public.parents WHERE user_id = auth.uid()))
  WITH CHECK (parent_id IN (SELECT id FROM public.parents WHERE user_id = auth.uid()));
