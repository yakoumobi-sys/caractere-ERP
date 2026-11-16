export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { withSystem } from "@/lib/db";
import { fetchStatuses, mapYalidineStatus, yalidineConfigured } from "@/lib/yalidine";

// Synchronisation planifiée (Vercel Cron) des colis en cours. Sans clés API, ne fait rien.
export async function GET(req: Request) {
  if (process.env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  if (!yalidineConfigured()) return NextResponse.json({ skipped: "API Yalidine non configurée" });
  const trackings: string[] = await withSystem(async (c) => (await c.query("select tracking from erp.shipments where mode = 'yalidine' and tracking is not null and status in ('expedie','en_transit','echec')")).rows.map((r) => r.tracking));
  const out: Record<string, string> = {};
  for (let i = 0; i < trackings.length; i += 50) {
    for (const p of await fetchStatuses(trackings.slice(i, i + 50))) {
      const st = mapYalidineStatus(p.label);
      if (!st) continue;
      out[p.tracking] = await withSystem(async (c) => (await c.query("select erp.ingest_carrier_event('yalidine', $1, $2, $3, $4, $5, $6) r", [`sync-${p.tracking}-${p.label}-${p.at.toISOString()}`, p.tracking, st, p.label, p.at, p])).rows[0].r);
    }
  }
  return NextResponse.json({ checked: trackings.length, results: out });
}
