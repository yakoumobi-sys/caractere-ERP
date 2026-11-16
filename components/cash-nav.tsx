import { Tabs } from "./ui";
export function CashTabs({ current }: { current: string }) {
  return <Tabs current={current} items={[
    { key: "jour", label: "Caisse du jour", href: "/caisse" }, { key: "reglements", label: "Facturé / reçu", href: "/caisse?vue=reglements" },
    { key: "reversements", label: "Reversements Yalidine", href: "/caisse/reversements" }, { key: "sessions", label: "Clôtures", href: "/caisse/sessions" },
  ]} />;
}
