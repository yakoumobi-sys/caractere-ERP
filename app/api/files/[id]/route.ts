import { NextResponse } from "next/server";
import { getMe } from "@/lib/auth";
import { one } from "@/lib/erp";
import { readStoredFile } from "@/lib/storage";

// Les fichiers clients ne sont servis qu'aux utilisateurs connectés autorisés (vue erp.v_files filtrée par rôle).
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const me = await getMe();
  if (!me) return new NextResponse("Non connecté", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new NextResponse("Introuvable", { status: 404 });
  const f = await one(me, "select * from erp.v_files where id = $1", [params.id]);
  if (!f) return new NextResponse("Introuvable ou non autorisé", { status: 404 });
  try {
    const buf = await readStoredFile(f.storage, f.path);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": f.mime || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(f.filename)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      },
    });
  } catch {
    return new NextResponse("Fichier introuvable", { status: 404 });
  }
}
