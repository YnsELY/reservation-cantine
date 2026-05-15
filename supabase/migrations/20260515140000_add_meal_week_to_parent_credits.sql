/*
  Ajoute meal_week_start_date à parent_credits.

  - `week_start_date` reste la semaine de VALIDITÉ du crédit (utilisée par
    `applyCreditsToCart` pour matcher l'item du panier).
  - `meal_week_start_date` est la semaine du REPAS annulé (utilisée pour la
    limite "2 annulations par semaine" — la limite porte sur la semaine du
    repas, pas la semaine de validité du crédit).

  Cas d'usage : une annulation effectuée le samedi décale la validité à la
  semaine suivante (le crédit n'aurait pas le temps d'être utilisé), mais la
  semaine du repas reste celle d'origine. Les deux colonnes sont donc égales
  dans le cas standard, différentes dans le cas du report.
*/

ALTER TABLE parent_credits
  ADD COLUMN IF NOT EXISTS meal_week_start_date date;

UPDATE parent_credits
  SET meal_week_start_date = week_start_date
  WHERE meal_week_start_date IS NULL;

ALTER TABLE parent_credits
  ALTER COLUMN meal_week_start_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_parent_credits_meal_week
  ON parent_credits(parent_id, meal_week_start_date);
