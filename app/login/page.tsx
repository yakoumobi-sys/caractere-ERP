import { redirect } from "next/navigation";
import { AUTH_MODE, getMe } from "@/lib/auth";
import { withSystem } from "@/lib/db";
import { ROLES } from "@/lib/perms";
import { SupabaseLogin } from "./supabase-login";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: { e?: string } }) {
  if (await getMe()) redirect("/");
  const staff =
    AUTH_MODE === "demo"
      ? await withSystem(async (c) => (await c.query("select auth_user_id, full_name, roles from erp.staff where active and auth_user_id is not null order by full_name")).rows)
      : [];
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-white">C</span>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Caractère ERP</h1>
          <p className="text-sm text-slate-500">Atelier de personnalisation textile — Aïn Benian</p>
        </div>
      </div>
      {searchParams.e && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Compte non reconnu : demandez au gérant de vous ajouter à l'équipe.</p>}
      {AUTH_MODE === "supabase" ? (
        <SupabaseLogin />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm text-slate-600">
            Mode démonstration : choisissez un profil. <span className="text-slate-400">(En production, la connexion passe par Supabase Auth.)</span>
          </p>
          <div className="grid gap-2">
            {staff.map((s: any) => (
              <form key={s.auth_user_id} action="/api/auth/demo" method="post">
                <input type="hidden" name="id" value={s.auth_user_id} />
                <button className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm hover:border-brand-300 hover:bg-brand-50">
                  <span className="font-medium text-slate-800">{s.full_name}</span>
                  <span className="text-xs text-slate-500">{(s.roles as string[]).map((r) => ROLES[r] || r).join(", ")}</span>
                </button>
              </form>
            ))}
            {!staff.length && <p className="text-sm text-amber-700">Aucun profil : lancez <code>npm run db:reset</code> pour charger les données de démonstration.</p>}
          </div>
        </div>
      )}
    </main>
  );
}
