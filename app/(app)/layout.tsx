import { requireMe } from "@/lib/auth";
import { NAV, ROLES } from "@/lib/perms";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe();
  const nav = NAV.filter((n) => me.can(n.cap)).map(({ href, label, icon }) => ({ href, label, icon }));
  return (
    <Shell nav={nav} user={me.fullName} roles={me.roles.map((r) => ROLES[r] || r).join(", ")} isManager={me.can("settings")}>
      {children}
    </Shell>
  );
}
