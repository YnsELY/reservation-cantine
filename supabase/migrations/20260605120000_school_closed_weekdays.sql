/*
  Jours de fermeture par école (pas de repas ces jours-là)

  - schools.closed_weekdays : smallint[] des jours fermés, convention JS Date.getDay()
    → 0 = dimanche, 1 = lundi, … 5 = vendredi, 6 = samedi.
    Tableau vide = école ouverte tous les jours (défaut des nouvelles écoles).

  Effets applicatifs :
  - Calendrier prestataire (« Créer ma semaine » / « Voir ma semaine ») : ces jours
    sont grisés et on ne peut pas y publier de menu.
  - Côté parent : aucun menu ces jours-là → le compte à rebours ne démarre que la
    veille d'un jour servi (ex. dimanche pour le lundi).

  Les écoles existant AU MOMENT de cette migration ne servent pas vendredi/samedi/
  dimanche → closed_weekdays = {0,5,6}. Les écoles ajoutées ENSUITE gardent {} (ouvertes).

  ⚠️ À exécuter UNE SEULE FOIS. Ne pas relancer le UPDATE après avoir ajouté de
  nouvelles écoles ouvertes, sinon elles seraient fermées elles aussi.
*/

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS closed_weekdays smallint[] NOT NULL DEFAULT '{}';

-- Fermer vendredi(5), samedi(6), dimanche(0) pour les écoles actuelles.
UPDATE public.schools
  SET closed_weekdays = '{0,5,6}';
