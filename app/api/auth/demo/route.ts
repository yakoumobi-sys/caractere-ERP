import { NextResponse } from "next/server";
import { AUTH_MODE, DEMO_COOKIE_NAME, demoCookieValue } from "@/lib/auth";

export async function POST(req: Request) {
  if (AUTH_MODE !== "demo") return NextResponse.json({ error: "Mode démo désactivé" }, { status: 403 });
  const fd = await req.formData();
  const id = String(fd.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.redirect(new URL("/login", req.url), 303);
  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set(DEMO_COOKIE_NAME, demoCookieValue(id), { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 12 });
  return res;
}
