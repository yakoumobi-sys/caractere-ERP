// Client pour l'API Yalidine (livraison Algérie) — https://api.yalidine.app/v1/
//
// Nécessite YALIDINE_API_ID et YALIDINE_API_TOKEN (Espace API du compte
// marchand Yalidine). Utilisé uniquement côté serveur (server actions / cron) —
// jamais exposé au navigateur.

const BASE_URL = "https://api.yalidine.app/v1";

function authHeaders() {
  const id = process.env.YALIDINE_API_ID;
  const token = process.env.YALIDINE_API_TOKEN;
  if (!id || !token) throw new Error("YALIDINE_API_ID / YALIDINE_API_TOKEN non configurées.");
  return { "X-API-ID": id, "X-API-TOKEN": token, "Content-Type": "application/json" };
}

async function yalidineFetch(path: string, init?: RequestInit) {
  const headers = authHeaders();
  console.log("🌐 YALIDINE Fetch:", path);
  console.log("   Headers:", {
    "X-API-ID": headers["X-API-ID"] ? "***" : "MANQUANT",
    "X-API-TOKEN": headers["X-API-TOKEN"] ? "***" : "MANQUANT",
  });

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => null);

  console.log(`📊 YALIDINE Réponse: HTTP ${res.status}`, body);

  if (!res.ok) {
    const message = body?.error?.message || body?.message || `Erreur Yalidine (HTTP ${res.status})`;
    console.error("❌ YALIDINE Erreur:", message);
    throw new Error(message);
  }
  return body;
}

export interface YalidineWilaya {
  id: number;
  name: string;
  zone: number;
  is_deliverable: number;
}

export async function listYalidineWilayas(): Promise<YalidineWilaya[]> {
  const body = await yalidineFetch("/wilayas/?page_size=100");
  return body?.data ?? [];
}

export interface CreateYalidineParcelInput {
  orderId: string;
  firstname: string;
  familyname: string;
  contactPhone: string;
  address: string;
  toWilayaName: string;
  toCommuneName: string;
  productList: string;
  price: number;
  isStopdesk?: boolean;
  stopdeskId?: number;
}

export interface CreateYalidineParcelResult {
  success: boolean;
  tracking?: string;
  label?: string;
  message?: string;
}

/**
 * Crée une expédition réelle chez Yalidine (POST /parcels). Action
 * irréversible côté transporteur — un colis physique est engagé.
 *
 * La réponse de l'API Yalidine est indexée par order_id (pas un tableau) :
 * { "<order_id>": { success, tracking, ... } }. On gère aussi le cas où la
 * réponse serait un tableau, au cas où l'API renvoie une autre forme.
 */
export async function createYalidineParcel(input: CreateYalidineParcelInput): Promise<CreateYalidineParcelResult> {
  const fromWilayaName = process.env.YALIDINE_FROM_WILAYA || "Alger";

  const payload = [
    {
      order_id: input.orderId,
      from_wilaya_name: fromWilayaName,
      firstname: input.firstname,
      familyname: input.familyname || input.firstname,
      contact_phone: input.contactPhone,
      address: input.address,
      to_commune_name: input.toCommuneName,
      to_wilaya_name: input.toWilayaName,
      product_list: input.productList,
      price: input.price,
      is_stopdesk: !!input.isStopdesk,
      stopdesk_id: input.isStopdesk ? input.stopdeskId : undefined,
      has_exchange: 0,
      freeshipping: false,
    },
  ];

  console.log("🚀 YALIDINE: Envoi du payload:", JSON.stringify(payload, null, 2));
  console.log("🔑 YALIDINE: API ID configuré?", !!process.env.YALIDINE_API_ID);
  console.log("🔑 YALIDINE: API TOKEN configuré?", !!process.env.YALIDINE_API_TOKEN);

  let body;
  try {
    body = await yalidineFetch("/parcels/", { method: "POST", body: JSON.stringify(payload) });
    console.log("✅ YALIDINE: Réponse reçue:", JSON.stringify(body, null, 2));
  } catch (error) {
    console.error("❌ YALIDINE: Erreur lors de l'appel API:", error);
    throw error;
  }

  const entry = body?.[input.orderId] ?? (Array.isArray(body) ? body[0] : null) ?? body;
  console.log("📦 YALIDINE: Entry trouvée:", JSON.stringify(entry, null, 2));

  if (!entry) throw new Error("Réponse Yalidine inattendue : impossible de trouver le résultat de la création.");
  if (entry.success === false) throw new Error(entry.message || "Échec de la création de l'expédition Yalidine.");

  console.log("✅ YALIDINE: Colis créé avec tracking:", entry.tracking);
  return { success: true, tracking: entry.tracking, label: entry.label, message: entry.message };
}

/**
 * Statut interne réduit — celui déjà utilisé par yalidine_shipments.status
 * et le déclencheur d'alerte alert_on_yalidine_failure() (voir migration
 * 0019). Les libellés réels renvoyés par Yalidine varient ("Sorti en
 * livraison", "Tentative échouée", "Retour à retirer", ...) — on les
 * ramène à ce petit ensemble par mots-clés plutôt que par correspondance
 * exacte, plus robuste aux formulations qu'on n'a pas encore rencontrées.
 */
export type InternalYalidineStatus = "pending" | "in_transit" | "delivered" | "failed" | "cancelled";

export function mapYalidineStatus(lastStatus: string | null | undefined): InternalYalidineStatus {
  const s = (lastStatus || "").toLowerCase();
  if (!s) return "pending";
  if (s.includes("livré")) return "delivered";
  if (s.includes("échou") || s.includes("echou") || s.includes("retour")) return "failed";
  if (s.includes("annul")) return "cancelled";
  if (s.includes("préparation") || s.includes("pas encore expédié") || s.includes("à expédier")) return "pending";
  return "in_transit";
}

export interface YalidineParcelStatus {
  tracking: string;
  last_status: string;
  date_last_status: string | null;
  label: string | null;
}

/** Interroge le statut réel de plusieurs colis en un seul appel (GET /parcels?tracking=a,b,c). */
export async function getYalidineParcelsByTrackings(trackings: string[]): Promise<YalidineParcelStatus[]> {
  if (trackings.length === 0) return [];
  const body = await yalidineFetch(`/parcels/?tracking=${trackings.map(encodeURIComponent).join(",")}`);
  return (body?.data ?? []).map((p: any) => ({
    tracking: p.tracking,
    last_status: p.last_status,
    date_last_status: p.date_last_status,
    label: p.label,
  }));
}
