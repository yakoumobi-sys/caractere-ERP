// Intégration Yalidine (reprise de l'ancien client lib/yalidine.ts) — optionnelle et configurable.
// Sans YALIDINE_API_ID / YALIDINE_API_TOKEN, le tracking et les statuts se saisissent à la main.
const BASE_URL = process.env.YALIDINE_API_URL || "https://api.yalidine.app/v1";

export const yalidineConfigured = () => !!(process.env.YALIDINE_API_ID && process.env.YALIDINE_API_TOKEN);

async function yf(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "X-API-ID": process.env.YALIDINE_API_ID!, "X-API-TOKEN": process.env.YALIDINE_API_TOKEN!, "Content-Type": "application/json" },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message || body?.message || `Erreur Yalidine (HTTP ${res.status})`);
  return body;
}

/** Statut Yalidine (libellé libre) → statut interne du colis */
export function mapYalidineStatus(label: string | null | undefined): "expedie" | "en_transit" | "livre" | "echec" | "retour" | "annule" | null {
  const s = (label || "").toLowerCase();
  if (!s) return null;
  if (s.includes("livré") || s.includes("livre")) return s.includes("non livr") ? "echec" : "livre";
  if (s.includes("retour")) return "retour";
  if (s.includes("échou") || s.includes("echou") || s.includes("tentative") || s.includes("injoignable")) return "echec";
  if (s.includes("annul")) return "annule";
  if (s.includes("expédi") || s.includes("expedi") || s.includes("ramass")) return "expedie";
  if (s.includes("préparation") || s.includes("pas encore")) return null;
  return "en_transit";
}

export async function createParcel(i: { orderRef: string; name: string; phone: string; address: string; wilaya: string; commune: string; products: string; price: number; stopdesk?: boolean }) {
  const [firstname, ...rest] = (i.name || "Client").split(" ");
  const payload = [{
    order_id: i.orderRef, from_wilaya_name: process.env.YALIDINE_FROM_WILAYA || "Alger", firstname, familyname: rest.join(" ") || firstname,
    contact_phone: (i.phone || "").replace(/^\+213/, "0"), address: i.address, to_commune_name: i.commune, to_wilaya_name: i.wilaya,
    product_list: i.products, price: i.price, is_stopdesk: !!i.stopdesk, has_exchange: 0, freeshipping: false,
  }];
  const body = await yf("/parcels/", { method: "POST", body: JSON.stringify(payload) });
  const entry = body?.[i.orderRef] ?? (Array.isArray(body) ? body[0] : null) ?? body;
  if (!entry || entry.success === false || !entry.tracking) throw new Error(entry?.message || "Création du colis Yalidine refusée.");
  return { tracking: String(entry.tracking), label: entry.label as string | undefined };
}

export async function fetchStatuses(trackings: string[]) {
  if (!trackings.length) return [];
  const body = await yf(`/parcels/?tracking=${trackings.map(encodeURIComponent).join(",")}`);
  return (body?.data ?? []).map((p: any) => ({ tracking: String(p.tracking).toUpperCase(), label: String(p.last_status || ""), at: p.date_last_status ? new Date(String(p.date_last_status).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(p.date_last_status)) ? "" : "+01:00")) : new Date() }));
}
