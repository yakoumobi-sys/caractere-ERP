import { getCurrentProfile, ROLE_LABELS } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth-actions";

export async function Topbar() {
  const profile = await getCurrentProfile();

  return (
    <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-end gap-4 px-6 sticky top-0 z-10">
      <div className="text-right">
        <p className="text-sm font-medium text-slate-900">{profile?.full_name ?? "Utilisateur"}</p>
        <p className="text-xs text-slate-500">{profile ? ROLE_LABELS[profile.role] : ""}</p>
      </div>
      <div className="h-9 w-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold">
        {(profile?.full_name ?? "U").slice(0, 1).toUpperCase()}
      </div>
      <form action={signOut}>
        <button className="text-sm text-slate-500 hover:text-slate-900">Déconnexion</button>
      </form>
    </header>
  );
}
