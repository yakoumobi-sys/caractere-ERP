import { getCurrentProfile, ROLE_LABELS } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth-actions";

/** Contenu de droite de la barre du haut — la barre elle-même (hauteur, bouton menu) vit dans AppShell */
export async function Topbar() {
  const profile = await getCurrentProfile();

  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <div className="text-right hidden sm:block">
        <p className="text-sm font-medium text-slate-900">{profile?.full_name ?? "Utilisateur"}</p>
        <p className="text-xs text-slate-500">{profile ? ROLE_LABELS[profile.role] : ""}</p>
      </div>
      <div className="h-9 w-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold shrink-0">
        {(profile?.full_name ?? "U").slice(0, 1).toUpperCase()}
      </div>
      <form action={signOut}>
        <button className="text-sm text-slate-500 hover:text-slate-900">Déconnexion</button>
      </form>
    </div>
  );
}
