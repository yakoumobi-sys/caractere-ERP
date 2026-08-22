import { createClient } from "@/lib/supabase/server";
import { addActivity } from "@/lib/actions/crm-actions";
import { Button, Card, inputClass } from "@/components/ui";
import { formatDate } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  note: "Note",
  appel: "Appel",
  email: "Email",
  reunion: "Réunion",
};

export async function ActivityLog({ contactId }: { contactId: string }) {
  const supabase = createClient();
  const { data: activities } = await supabase
    .from("activities")
    .select("*")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });

  async function submit(formData: FormData) {
    "use server";
    await addActivity(contactId, formData);
  }

  return (
    <Card className="p-6 mt-6">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">Historique & activités</h2>
      <form action={submit} className="flex flex-wrap items-start gap-2 mb-4">
        <select name="type" defaultValue="note" className={`${inputClass} w-32`}>
          <option value="note">Note</option>
          <option value="appel">Appel</option>
          <option value="email">Email</option>
          <option value="reunion">Réunion</option>
        </select>
        <input name="content" placeholder="Ajouter une note..." className={`${inputClass} flex-1 min-w-[200px]`} />
        <Button type="submit" variant="secondary">
          Ajouter
        </Button>
      </form>

      {(!activities || activities.length === 0) && (
        <p className="text-sm text-slate-400">Aucune activité enregistrée.</p>
      )}
      <div className="flex flex-col gap-3">
        {activities?.map((a: any) => (
          <div key={a.id} className="border-l-2 border-brand-200 pl-3">
            <p className="text-xs text-slate-400">
              {TYPE_LABEL[a.type] ?? a.type} — {formatDate(a.created_at)}
            </p>
            <p className="text-sm text-slate-700">{a.content}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
