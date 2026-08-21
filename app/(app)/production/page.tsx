import { createClient } from "@/lib/supabase/server";
import { PageHeader, LinkButton } from "@/components/ui";
import { PipelineBoard } from "@/components/production/pipeline-board";

export default async function Page() {
  const supabase = createClient();
  const [{ data: orders }, { data: employees }] = await Promise.all([
    supabase.from("pipeline_orders_view").select("*").order("updated_at", { ascending: false }).limit(200),
    supabase.from("employees").select("id, first_name, last_name, department").eq("status", "actif").order("first_name"),
  ]);

  return (
    <div>
      <PageHeader
        title="Suivi de production"
        description="Réception WhatsApp → Commercial → Atelier DTF / Broderie → Flocage → retour Commercial → Client"
        action={<LinkButton href="/production/new">+ Nouvelle commande</LinkButton>}
      />
      <PipelineBoard orders={(orders as any) ?? []} employees={(employees as any) ?? []} />
    </div>
  );
}
