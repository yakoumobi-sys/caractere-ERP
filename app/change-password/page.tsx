import { changePassword } from "@/lib/actions/auth-actions";
import { Button, Card, Field, inputClass } from "@/components/ui";

export default function ChangePasswordPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 px-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 dark:opacity-10" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 dark:opacity-10" />
      </div>

      <Card glass className="w-full max-w-sm p-8 relative z-10">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center font-bold">
            C
          </div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Première connexion</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Choisis ton mot de passe définitif pour continuer.
          </p>
        </div>

        {searchParams.error && (
          <div className="mb-4 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {searchParams.error}
          </div>
        )}

        <form action={changePassword} className="flex flex-col gap-4">
          <Field label="Nouveau mot de passe" htmlFor="password" required>
            <input id="password" name="password" type="password" required minLength={6} autoFocus className={inputClass} />
          </Field>
          <Field label="Confirmer le mot de passe" htmlFor="confirm_password" required>
            <input id="confirm_password" name="confirm_password" type="password" required minLength={6} className={inputClass} />
          </Field>
          <Button type="submit" className="mt-2">
            Valider et continuer
          </Button>
        </form>
      </Card>
    </div>
  );
}
