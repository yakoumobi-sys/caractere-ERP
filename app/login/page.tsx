import { signIn, signUp } from "@/lib/actions/auth-actions";
import { Button, Card, Field, inputClass } from "@/components/ui";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { mode?: string; error?: string; message?: string };
}) {
  const isSignup = searchParams.mode === "signup";

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <Card className="w-full max-w-sm p-8">
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
            <Field label="Nom complet" htmlFor="full_name" required>
              <input id="full_name" name="full_name" type="text" required className={inputClass} />
            </Field>
          )}
          <Field label="Email" htmlFor="email" required>
            <input id="email" name="email" type="email" required className={inputClass} />
          </Field>
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
