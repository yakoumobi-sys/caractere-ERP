import { createClient } from "@/lib/supabase/server";
import { PageHeader, LinkButton } from "@/components/ui";
import { OpportunityBoard } from "@/components/crm/opportunity-board";

export default async function Page() {
  const supabase = createClient();
  const { data } = await supabase
    .from("opportunities")
    .select("id, title, stage, amount, contacts(name)")
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHeader title="Opportunités" description="Pipeline commercial" action={<LinkButton href="/crm/opportunities/new">+ Nouvelle opportunité</LinkButton>} />
      <OpportunityBoard opportunities={(data as any) ?? []} />
    </div>
  );
}
