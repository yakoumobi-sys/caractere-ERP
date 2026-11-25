import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { withSystem } from "@/lib/db";
import { mapYalidineStatus } from "@/lib/yalidine";

// Réception des mises à jour de colis. Idempotent (identifiant d'événement) et tolérant au désordre (date de l'événement).
// Corps accepté : { tracking, status | last_status, date, id } ou { events: [...] }.
export async function POST(req: Request) {
  const secret = process.env.YALIDINE_WEBHOOK_SECRET;
  const got = req.headers.get("x-webhook-secret") || new URL(req.url).searchParams.get("secret") || "";
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const list: any[] = Array.isArray(body) ? body : Array.isArray(body?.events) ? body.events : body?.data ? [].concat(body.data) : body ? [body] : [];
  const results = [];
  for (const e of list) {
    const tracking = String(e.tracking || e.tracking_number || "").toUpperCase();
    const label = String(e.status || e.last_status || e.label || "");
    const status = ["expedie", "en_transit", "livre", "echec", "retour", "annule"].includes(label) ? label : mapYalidineStatus(label);
    if (!tracking || !status) { results.push({ tracking, outcome: "ignore" }); continue; }
    const at = e.date || e.date_status || e.occurred_at ? new Date(e.date || e.date_status || e.occurred_at) : new Date();
    const extId = String(e.id || e.event_id || `${tracking}-${label}-${at.toISOString()}`);
    const outcome = await withSystem(async (c) => (await c.query("select erp.ingest_carrier_event('yalidine', $1, $2, $3, $4, $5, $6) r", [extId, tracking, status, label, at, e])).rows[0].r);
    results.push({ tracking, outcome });
  }
  return NextResponse.json({ results });
}
