/*
  # Ajout de l'authentification utilisateur

  1. Modifications
    - Ajout de la colonne `user_id` (uuid) à la table `parents`
      - Référence à `auth.users.id`
      - Unique pour garantir qu'un utilisateur = un parent
    - Ajout de la colonne `user_id` (uuid) à la table `schools`
      - Référence à `auth.users.id`
      - Unique pour garantir qu'un utilisateur = une école
    
  2. Sécurité
    - Aucune modification des politiques RLS existantes
    - Les colonnes `user_id` permettront une future implémentation RLS basée sur l'authentification

  3. Notes importantes
    - Les colonnes `access_code` existantes sont conservées pour la rétrocompatibilité
    - Les colonnes `user_id` sont nullable pour permettre la migration progressive
    - Les comptes existants pourront continuer à utiliser les access_code
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parents' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE parents ADD COLUMN user_id uuid REFERENCES auth.users(id) UNIQUE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schools' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE schools ADD COLUMN user_id uuid REFERENCES auth.users(id) UNIQUE;
  END IF;
END $$;
