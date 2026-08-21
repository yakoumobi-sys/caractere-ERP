import { createClient } from "@/lib/supabase/server";
import { addComment } from "@/lib/actions/collaboration-actions";
import { Card, Button, inputClass } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export async function OrderComments({ orderId }: { orderId: string }) {
  const supabase = createClient();
  const { data: comments } = await supabase
    .from("pipeline_comments")
    .select("id, content, created_at, author_id, profiles(full_name)")
    .eq("pipeline_order_id", orderId)
    .order("created_at", { ascending: false });

  async function submit(formData: FormData) {
    "use server";
    await addComment(orderId, formData.get("content") as string);
  }

  return (
    <Card className="p-6 mb-6">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Commentaires & notes</h2>

      {comments && comments.length > 0 && (
        <div className="space-y-3 mb-4">
          {comments.map((c: any) => (
            <div key={c.id} className="text-sm border-l-2 border-brand-200 dark:border-brand-500/30 pl-3">
              <div className="flex items-center gap-2">
                <p className="font-medium text-slate-900 dark:text-white">{c.profiles?.full_name ?? "Utilisateur"}</p>
                <span className="text-xs text-slate-400 dark:text-slate-500">{formatDate(c.created_at)}</span>
              </div>
              <p className="text-slate-700 dark:text-slate-300 mt-1">{c.content}</p>
            </div>
          ))}
        </div>
      )}

      <form action={submit} className="flex gap-2">
        <input
          name="content"
          placeholder="Ajouter une note (ex: en attente client, visuel OK)"
          className={`${inputClass} flex-1`}
          required
        />
        <Button type="submit" variant="secondary">
          Ajouter
        </Button>
      </form>
    </Card>
  );
}
