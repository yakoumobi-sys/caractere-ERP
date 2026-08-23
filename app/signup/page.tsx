import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Button, Field, inputClass } from "@/components/ui";

async function signUp(formData: FormData) {
  "use server";

  const supabase = createClient();
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const confirmPassword = String(formData.get("confirm_password"));

  if (password !== confirmPassword) {
    throw new Error("Les mots de passe ne correspondent pas");
  }

  if (password.length < 6) {
    throw new Error("Le mot de passe doit faire au minimum 6 caractères");
  }

  try {
    // Create auth user only
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error("Impossible de créer l'utilisateur");

    // Success - redirect to login
    redirect("/login?registered=true");
  } catch (error) {
    console.error("Signup error:", error);
    throw error;
  }
}

export default async function SignUpPage() {
  const {
    data: { session },
  } = await createClient().auth.getSession();

  if (session) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Décoration avec glassmorphism */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 dark:opacity-10" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 dark:opacity-10" />
      </div>

      <Card glass className="w-full max-w-md p-8 relative z-10">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center font-bold">
            C
          </div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Caractère ERP</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Créer un compte</p>
        </div>

        <form action={signUp} className="flex flex-col gap-4">
          <Field label="Email professionnel" htmlFor="email" required>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="jean@caractere.com"
              required
              className={inputClass}
            />
          </Field>

          <Field label="Mot de passe" htmlFor="password" required>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
              minLength={6}
              className={inputClass}
            />
          </Field>

          <Field label="Confirmer le mot de passe" htmlFor="confirm_password" required>
            <input
              id="confirm_password"
              name="confirm_password"
              type="password"
              placeholder="••••••••"
              required
              minLength={6}
              className={inputClass}
            />
          </Field>

          <Button type="submit" className="w-full">
            Créer mon compte
          </Button>
        </form>

        <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-4">
          Déjà un compte ?{" "}
          <a href="/login" className="text-brand-600 hover:text-brand-700 font-medium">
            Se connecter
          </a>
        </p>
      </Card>
    </div>
  );
}
