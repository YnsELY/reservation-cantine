/*
  # Associer les menus existants aux prestataires

  1. Mise à jour
    - Associe les menus existants à leurs prestataires basé sur provider_school_access
    - Permet aux statistiques de fonctionner correctement avec les données existantes
  
  2. Notes
    - Cette migration est idempotente et peut être exécutée plusieurs fois
    - Seuls les menus des écoles auxquelles le prestataire a accès sont mis à jour
*/

-- Mettre à jour les menus existants pour les associer aux prestataires qui ont accès à leur école
UPDATE menus m
SET provider_id = psa.provider_id
FROM provider_school_access psa
WHERE m.school_id = psa.school_id
  AND m.provider_id IS NULL;
