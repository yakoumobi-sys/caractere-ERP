import { Tabs } from "./ui";
export function StockTabs({ current }: { current: string }) {
  return <Tabs current={current} items={[
    { key: "vetements", label: "Vêtements vierges", href: "/stock" }, { key: "consommables", label: "Consommables", href: "/stock?vue=consommables" },
    { key: "alertes", label: "Alertes", href: "/stock?vue=alertes" }, { key: "mouvements", label: "Mouvements", href: "/stock/mouvements" },
    { key: "ruptures", label: "Indisponibles", href: "/stock?vue=ruptures" },
    { key: "achats", label: "Achats", href: "/stock/achats" },
  ]} />;
}
