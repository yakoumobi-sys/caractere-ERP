import { createClient } from "@/lib/supabase/server";
import { UserRow } from "@/components/settings/user-row";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export default async function Page() {
  const supabase = createClient();
  const { data: users } = await supabase.from("profiles").select("*").order("created_at");

  return (
    <div>
      <PageHeader
        title="Utilisateurs"
        description="Gestion des accès — les nouveaux comptes se créent depuis l'écran de connexion"
      />
      <Card className="overflow-x-auto">
        {(!users || users.length === 0) && <EmptyState title="Aucun utilisateur." />}
        {users && users.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5 font-medium">Nom</th>
                <th className="px-4 py-2.5 font-medium">Rôle</th>
                <th className="px-4 py-2.5 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <UserRow key={u.id} user={u} />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
