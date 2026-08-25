import { NextRequest, NextResponse } from "next/server";
import { syncYalidineStatuses } from "@/lib/actions/yalidine-actions";

/**
 * Appelé périodiquement par Vercel Cron (voir vercel.json) pour rafraîchir
 * le statut réel des colis Yalidine en cours. Protégé par CRON_SECRET —
 * Vercel Cron envoie automatiquement `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const result = await syncYalidineStatuses();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("sync-yalidine cron error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
