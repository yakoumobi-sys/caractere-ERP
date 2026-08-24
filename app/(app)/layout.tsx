import { AppShell } from "@/components/app-shell";
import { Topbar } from "@/components/topbar";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: company } = await supabase.from("companies").select("name,logo_url").limit(1).single();

  return (
    <AppShell topbar={<Topbar />} logoUrl={company?.logo_url ?? null} companyName={company?.name ?? "Caractère"}>
      {children}
    </AppShell>
  );
}
