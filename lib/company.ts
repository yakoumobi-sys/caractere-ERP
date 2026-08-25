import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Nom + logo de la société, affichés dans la sidebar sur CHAQUE page de
 * l'app — sans cache, ça veut dire une requête Supabase de plus à chaque
 * navigation, pour une donnée qui ne change quasiment jamais (seulement via
 * Paramètres > Société).
 *
 * Mise en cache via unstable_cache (identique pour tous les utilisateurs,
 * donc pas besoin d'un cache par utilisateur) — client service role car
 * cette fonction ne s'exécute pas forcément dans le contexte d'une requête
 * utilisateur (le cache peut être réchauffé indépendamment). Invalidée
 * immédiatement après une modification via revalidateTag("company") dans
 * lib/actions/settings-actions.ts.
 */
export const getCompanyInfo = unstable_cache(
  async () => {
    const supabase = createAdminClient();
    const { data } = await supabase.from("companies").select("name,logo_url").limit(1).single();
    return { name: data?.name ?? "Caractère", logoUrl: data?.logo_url ?? null };
  },
  ["company-info"],
  { tags: ["company"], revalidate: 3600 }
);
