import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// NB : le client n'est volontairement pas typé par le schéma généré (`<Database>`) —
// nos types dans types/database.ts sont écrits à la main et la génération stricte des
// types de requête de @supabase/ssr peut alors mal inférer certains `.select()`.
// Les types métier (Contact, Invoice, ...) restent utilisés explicitement dans l'app.
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // appelé depuis un Server Component : la session est déjà
            // rafraîchie par le middleware, on peut ignorer.
          }
        },
      },
    }
  );
}
