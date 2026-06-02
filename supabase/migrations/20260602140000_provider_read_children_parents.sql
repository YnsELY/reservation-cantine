/*
  Lecture par les PRESTATAIRES des enfants / parents qui ont commandé un de
  LEURS menus.

  Contexte : la migration RLS (20260515130000) a verrouillé `children` et
  `parents` aux roles parent / ecole / admin. L'ecran prestataire
  "Detail des commandes" (app/(provider)/menu-orders.tsx) lit `children`
  (nom, allergies, classe, sexe) et `parents` (nom) pour preparer les repas ;
  sans policy prestataire, ces lectures renvoient vide et le filtre par sexe ne
  peut pas fonctionner.

  IMPORTANT — anti-recursion (42P17) : on n'ecrit PAS la sous-requete
  directement dans le corps de la policy. En effet `reservations_select_school`
  lit `children` dans son propre corps, ce qui creerait le cycle
  children -> reservations -> children. On encapsule donc la verification dans
  des fonctions SECURITY DEFINER (qui bypassent le RLS des tables lues et cassent
  le cycle), en LANGUAGE plpgsql pour empecher tout inlining du planificateur
  (qui reintroduirait le RLS). Meme pattern que is_admin() / current_provider_id().

  Perimetre minimal : un prestataire ne voit un enfant/parent QUE s'il existe une
  reservation de cet enfant/parent sur un menu dont il est le fournisseur.
*/

CREATE OR REPLACE FUNCTION public.provider_can_read_child(p_child_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM reservations r
    JOIN menus m ON m.id = r.menu_id
    JOIN providers p ON p.id = m.provider_id
    WHERE r.child_id = p_child_id
      AND p.user_id = auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.provider_can_read_parent(p_parent_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM reservations r
    JOIN menus m ON m.id = r.menu_id
    JOIN providers p ON p.id = m.provider_id
    WHERE r.parent_id = p_parent_id
      AND p.user_id = auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.provider_can_read_child(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provider_can_read_parent(uuid) TO authenticated;

DROP POLICY IF EXISTS "children_select_provider" ON public.children;
CREATE POLICY "children_select_provider"
  ON public.children FOR SELECT
  TO authenticated
  USING (public.provider_can_read_child(children.id));

DROP POLICY IF EXISTS "parents_select_provider" ON public.parents;
CREATE POLICY "parents_select_provider"
  ON public.parents FOR SELECT
  TO authenticated
  USING (public.provider_can_read_parent(parents.id));
