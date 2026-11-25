import { NextResponse } from "next/server";
import { AUTH_MODE, DEMO_COOKIE_NAME, supabaseServer } from "@/lib/auth";

export async function POST(req: Request) {
  if (AUTH_MODE === "supabase") await supabaseServer().auth.signOut();
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.delete(DEMO_COOKIE_NAME);
  return res;
}
