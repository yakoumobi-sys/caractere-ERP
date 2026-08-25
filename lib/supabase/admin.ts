import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase "service role" — contourne le RLS.
 *
 * À N'UTILISER QUE côté serveur, pour du code qui ne tourne pas dans le
 * contexte d'un utilisateur connecté (ex : un webhook externe comme
 * app/api/webhooks/site-orders/route.ts). Pour tout le reste, utiliser
 * lib/supabase/server.ts (respecte les policies RLS de l'utilisateur).
 */
export function createAdminClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
