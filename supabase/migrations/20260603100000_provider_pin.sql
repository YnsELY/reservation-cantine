/*
  PIN d'accès aux pages de GESTION du prestataire (créer ma semaine, voir ma
  semaine, menus, suppléments) + indicateur de première connexion.

  - providers.pin : code à 4 chiffres défini par l'admin à la création, modifiable
    par le prestataire. NULL = pas de verrou (prestataires existants).
  - providers.must_change_credentials : true à la création → suggestion de changer
    mot de passe + PIN à la première connexion. Passe à false une fois fait/ignoré.

  RLS : le prestataire met à jour sa propre ligne (pin / must_change_credentials)
  via la policy existante "Providers can update own data" (auth.uid() = user_id) ;
  l'admin écrit le pin à la création (flux d'insert existant). Aucune policy à ajouter.
*/

ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS pin text;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS must_change_credentials boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'providers_pin_check') THEN
    ALTER TABLE public.providers
      ADD CONSTRAINT providers_pin_check CHECK (pin IS NULL OR pin ~ '^[0-9]{4}$');
  END IF;
END $$;
