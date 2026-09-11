import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { PageHeader, LinkButton } from "@/components/ui";
import { OpportunityBoard } from "@/components/crm/opportunity-board";
import { businessDate } from "@/lib/finance";
export default async function Page() {
  const supabase = createClient();
  const [{ data, error }, profile] = await Promise.all([
    supabase
      .from("opportunities")
      .select(
        "id,title,stage,amount,contact_id,next_action,next_follow_up,owner_id,contacts(name,phone)",
      )
      .order("next_follow_up", { ascending: true, nullsFirst: false })
      .limit(1000),
    getCurrentProfile(),
  ]);
  return (
    <div>
      <PageHeader
        title="Opportunités & relances"
        description="Du premier contact à la commande confirmée."
        action={
          <LinkButton href="/crm/opportunities/new">
            + Nouvelle opportunité
          </LinkButton>
        }
      />
      {error ? (
        <p role="alert" className="text-red-600">
          Impossible de charger le suivi commercial. Vérifiez que la mise à jour
          de la base a été appliquée.
        </p>
      ) : (
        <>
          <OpportunityBoard
            opportunities={(data as any) ?? []}
            today={businessDate()}
            userId={profile?.id ?? null}
          />
          {data?.length === 1000 && (
            <p className="text-sm mt-3">
              Affichage limité aux 1 000 premières opportunités, triées par date
              de relance.
            </p>
          )}
        </>
      )}
    </div>
  );
}
