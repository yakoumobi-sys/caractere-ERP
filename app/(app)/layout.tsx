import { AppShell } from "@/components/app-shell";
import { Topbar } from "@/components/topbar";
import { getCompanyInfo } from "@/lib/company";

// getCompanyInfo() n'utilise plus cookies() (client service role + cache) —
// sans ce garde-fou explicite, Next.js pourrait essayer de générer cette
// page en statique au build au lieu de la rendre à chaque requête. Toutes
// les pages sous ce layout dépendent de la session/RLS de l'utilisateur
// courant : elles doivent impérativement rester dynamiques, jamais figées
// dans un HTML généré une fois pour toutes au build.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const company = await getCompanyInfo();

  return (
    <AppShell topbar={<Topbar />} logoUrl={company.logoUrl} companyName={company.name}>
      {children}
    </AppShell>
  );
}
