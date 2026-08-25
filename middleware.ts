import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // /api/* est exclu : ces routes (webhooks/cron externes) s'authentifient
  // elles-mêmes par secret partagé et n'ont pas de session utilisateur —
  // les laisser passer par ce middleware les redirigerait vers /login avant
  // même d'atteindre le handler (constaté en prod : 307 sur les deux appels
  // externes après le déploiement du webhook site + du cron Yalidine).
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
