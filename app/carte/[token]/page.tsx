import { notFound } from "next/navigation";
import { withAnon } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Carte Caractère Privilège", robots: { index: false } };

// Lien individuel : n'affiche que la carte et l'offre (aucune autre donnée client).
export default async function Card({ params }: { params: { token: string } }) {
  if (!/^[0-9a-f]{32,128}$/.test(params.token)) notFound();
  const card = await withAnon(async (c) => (await c.query("select erp.public_card($1) as r", [params.token])).rows[0]?.r);
  if (!card) notFound();
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-5 px-4 py-10">
      <div className="w-full rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 p-5 text-white shadow-xl">
        <div className="text-xs uppercase tracking-[0.3em] opacity-70">Caractère</div>
        <div className="mt-1 text-2xl font-semibold">Privilège</div>
        <div className="mt-8 font-mono text-lg tracking-widest">{card.number}</div>
        <div className="mt-1 text-sm opacity-80">{card.first_name}</div>
      </div>
      <img src={card.photo_url} alt="T-shirt caractérisé" className="w-56" />
      <p className="text-center text-lg font-medium text-slate-900">{card.offer}</p>
      <p className="text-center text-sm text-slate-500">{card.gift_available ? "Votre cadeau vous attend : présentez cette carte lors de votre prochaine commande." : "Cadeau déjà utilisé — merci de votre fidélité !"}</p>
    </main>
  );
}
