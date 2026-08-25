import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Payload envoyé par caracterestore.com (app/api/commandes/route.ts) juste
// après l'insertion d'une commande dans sa propre table `commandes` —
// voir supabase/schema.sql du site pour la forme exacte.
interface SiteOrderPayload {
  reference: string;
  produit: string;
  quantite: number;
  couleur?: string;
  tailles?: string[];
  position?: string;
  technique?: string;
  urgent?: boolean;
  logo_url?: string;
  nom_client: string;
  entreprise?: string;
  telephone: string;
  email?: string;
  notes?: string;
  prix_unitaire?: number;
  prix_total?: number;
}

/**
 * Webhook du site caracterestore.com : fait entrer les commandes passées sur
 * le site dans la file d'appel "Confirmation" de l'ERP (même module que les
 * commandes WhatsApp/COD), pour que l'équipe les confirme avant fulfillment.
 * Crée aussi le client dans le CRM (contacts) s'il n'existe pas déjà —
 * identifié par téléphone — pour qu'il apparaisse dans la base client au
 * même titre qu'un contact ajouté manuellement.
 *
 * Sécurisé par un secret partagé (pas d'auth utilisateur possible ici, le
 * site et l'ERP sont deux projets Supabase distincts) — voir
 * SITE_ORDERS_WEBHOOK_SECRET dans les variables d'environnement Vercel des
 * deux projets.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  if (!secret || secret !== process.env.SITE_ORDERS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let payload: SiteOrderPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  if (!payload.reference || !payload.nom_client || !payload.telephone || !payload.produit) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Idempotence : un retry du site (timeout réseau, etc.) ne doit pas créer
  // deux fois la même commande dans la file de confirmation.
  const { data: existing } = await supabase
    .from("order_confirmations")
    .select("id, number")
    .eq("tracking_id", payload.reference)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ success: true, id: existing.id, number: existing.number, duplicate: true });
  }

  // Client de la base CRM : on identifie par téléphone (même convention que
  // le reste de l'ERP — le numéro du client est aussi son identifiant
  // WhatsApp). Un client qui recommande sur plusieurs commandes n'est donc
  // créé qu'une seule fois.
  const phone = payload.telephone.trim();
  const { data: existingContact } = await supabase.from("contacts").select("id").eq("phone", phone).maybeSingle();

  let contactId = existingContact?.id ?? null;
  if (!contactId) {
    const { data: newContact, error: contactError } = await supabase
      .from("contacts")
      .insert({
        name: payload.nom_client,
        company_name: payload.entreprise || null,
        phone,
        email: payload.email || null,
        country: "Algérie",
        type: "client",
      })
      .select("id")
      .single();
    if (contactError) console.error("site-orders webhook contact insert error:", contactError.message);
    else contactId = newContact.id;
  }

  const productDescription = [
    `${payload.quantite}× ${payload.produit}`,
    payload.couleur,
    payload.tailles?.length ? `(${payload.tailles.join(", ")})` : null,
    payload.technique ? `— ${payload.technique}` : null,
    payload.position ? `pose: ${payload.position}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const notesParts = [
    payload.entreprise ? `Entreprise : ${payload.entreprise}` : null,
    payload.email ? `Email : ${payload.email}` : null,
    payload.urgent ? "⚠️ Commande urgente" : null,
    payload.prix_total ? `Prix estimé (site) : ${payload.prix_total.toLocaleString("fr-FR")} DA` : null,
    payload.logo_url ? `Logo : ${payload.logo_url}` : null,
    payload.notes,
  ].filter(Boolean);

  const { data, error } = await supabase
    .from("order_confirmations")
    .insert({
      customer_name: payload.nom_client,
      customer_phone: payload.telephone,
      contact_id: contactId,
      product_description: productDescription,
      quantity: payload.quantite,
      sales_channel: "Site web",
      tracking_id: payload.reference,
      notes: notesParts.join("\n") || null,
    })
    .select("id, number")
    .single();

  if (error) {
    console.error("site-orders webhook insert error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: data.id, number: data.number });
}
