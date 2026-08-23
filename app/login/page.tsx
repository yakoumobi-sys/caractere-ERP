import { signIn, signUp } from "@/lib/actions/auth-actions";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { mode?: string; error?: string; message?: string };
}) {
  const isSignup = searchParams.mode === "signup";

  // Récupérer la liste des employés actifs
  let users: Array<{ id: string; full_name: string }> = [];
  if (!isSignup) {
    const supabase = createClient();
    // Essayer d'abord de charger depuis employees (plus complet)
    const { data: employeeData, error: empError } = await supabase
      .from("employees")
      .select("id, first_name, last_name")
      .eq("status", "actif")
      .order("first_name");

    if (!empError && employeeData) {
      users = employeeData.map((emp: any) => ({
        id: emp.id,
        full_name: `${emp.first_name} ${emp.last_name}`.trim(),
      }));
    } else {
      // Fallback: charger depuis profiles
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)
        .order("full_name");
      users = profileData || [];
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 px-4 relative overflow-hidden">
      {/* Décoration avec glassmorphism */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 dark:opacity-10" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 dark:opacity-10" />
      </div>

      <Card glass className="w-full max-w-sm p-8 relative z-10">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center font-bold">
            C
          </div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Caractère ERP</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isSignup ? "Créer le compte administrateur" : "Connecte-toi à ton espace"}
          </p>
        </div>

        {searchParams.error && (
          <div className="mb-4 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {searchParams.error}
          </div>
        )}
        {searchParams.message && (
          <div className="mb-4 rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-900 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
            {searchParams.message}
          </div>
        )}

        <form action={isSignup ? signUp : signIn} className="flex flex-col gap-4">
          {isSignup && (
            <>
              <Field label="Nom complet" htmlFor="full_name" required>
                <input id="full_name" name="full_name" type="text" required className={inputClass} />
              </Field>
              <Field label="Email" htmlFor="email" required>
                <input id="email" name="email" type="email" required className={inputClass} />
              </Field>
            </>
          )}
          {!isSignup && (
            <Field label="Utilisateur" htmlFor="username" required>
              <select id="username" name="username" required className={inputClass}>
                <option value="">-- Sélectionne ton nom --</option>
                {users.map((user) => (
                  <option key={user.id} value={user.full_name}>
                    {user.full_name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Mot de passe" htmlFor="password" required>
            <input id="password" name="password" type="password" required minLength={6} className={inputClass} />
          </Field>
          <Button type="submit" className="mt-2">
            {isSignup ? "Créer le compte" : "Se connecter"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          {isSignup ? (
            <a href="/login" className="text-brand-600 dark:text-brand-400 hover:underline">
              J&apos;ai déjà un compte
            </a>
          ) : (
            <a href="/login?mode=signup" className="text-brand-600 dark:text-brand-400 hover:underline">
              Premier lancement ? Créer le compte administrateur
            </a>
          )}
        </p>
      </Card>
    </div>
  );
}
