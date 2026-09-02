import { getCurrentProfile } from "@/lib/auth";

/**
 * Bandeau affiché à un compte qui ne peut rien écrire dans l'ERP.
 *
 * Sans lui, un compte désactivé (ou resté en "lecture seule") voyait
 * simplement des listes vides et des erreurs techniques au moment d'agir —
 * « new row violates row-level security policy » — sans jamais apprendre que
 * le problème venait de son compte. C'est exactement ce qui a fait croire que
 * « la commande ne se crée pas » chez certains employés.
 */
export async function AccountStatusBanner() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  if (!profile.is_active) {
    return (
      <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
        <strong>Votre compte est désactivé.</strong> Vous ne pouvez ni créer de commande ni
        enregistrer quoi que ce soit, et la plupart des listes resteront vides. Demandez à
        l&apos;administrateur de le réactiver dans Paramètres &gt; Utilisateurs.
      </div>
    );
  }

  if (profile.role === "readonly") {
    return (
      <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
        <strong>Votre compte est en lecture seule.</strong> Vous pouvez consulter l&apos;ERP mais
        rien enregistrer. Demandez à l&apos;administrateur de vous attribuer un rôle dans
        Paramètres &gt; Utilisateurs.
      </div>
    );
  }

  return null;
}
