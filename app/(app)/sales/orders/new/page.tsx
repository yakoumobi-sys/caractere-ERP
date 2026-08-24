import { redirect } from "next/navigation";

// Les commandes clients suivent désormais uniquement le configurateur de production
// (le même formulaire que "+ Nouvelle commande" sur le tableau de bord) — voir
// lib/documents.ts (ordersConfig.newHref).
export default function Page() {
  redirect("/production/new");
}
