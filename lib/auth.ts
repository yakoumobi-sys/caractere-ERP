import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { withUser, type Identity } from "./db";
import { roleCan, type Cap } from "./perms";

export const AUTH_MODE: "supabase" | "demo" =
  process.env.AUTH_MODE === "demo" || process.env.AUTH_MODE === "supabase"
    ? (process.env.AUTH_MODE as "supabase" | "demo")
    : process.env.NEXT_PUBLIC_SUPABASE_URL
      ? "supabase"
      : "demo";

const DEMO_COOKIE = "erp_demo_session";
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production" && AUTH_MODE === "demo") throw new Error("SESSION_SECRET obligatoire en mode démo en production.");
  return s || "caractere-dev-secret";
}
function sign(v: string) {
  return createHmac("sha256", secret()).update(v).digest("hex");
}
export function demoCookieValue(authId: string) {
  return `${authId}.${sign(authId)}`;
}
export const DEMO_COOKIE_NAME = DEMO_COOKIE;

export function supabaseServer() {
  const store = cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options?: any }[]) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* appelé depuis un Server Component : sans effet */
        }
      },
    },
  });
}

export const getIdentity = cache(async (): Promise<Identity | null> => {
  if (AUTH_MODE === "demo") {
    const raw = cookies().get(DEMO_COOKIE)?.value;
    if (!raw) return null;
    const [id, sig] = raw.split(".");
    if (!id || !sig) return null;
    const ok = Buffer.from(sig).length === Buffer.from(sign(id)).length && timingSafeEqual(Buffer.from(sig), Buffer.from(sign(id)));
    return ok ? { authId: id, email: null } : null;
  }
  const { data } = await supabaseServer().auth.getUser();
  if (!data.user) return null;
  return { authId: data.user.id, email: data.user.email ?? null };
});

export type Me = Identity & { staffId: string; fullName: string; roles: string[]; canValidateFirstPiece: boolean; can: (c: Cap) => boolean };

export const getMe = cache(async (): Promise<Me | null> => {
  const id = await getIdentity();
  if (!id) return null;
  const row = await withUser(id, async (c) => {
    let r = (await c.query("select * from erp.v_me")).rows[0];
    if (!r && id.email) {
      await c.query("select erp.link_auth_user()");
      r = (await c.query("select * from erp.v_me")).rows[0];
    }
    return r;
  });
  if (!row) return null;
  const roles: string[] = row.roles || [];
  return { ...id, staffId: row.id, fullName: row.full_name, roles, canValidateFirstPiece: row.can_validate_first_piece, can: (c: Cap) => roleCan(roles, c) };
});

export async function requireMe(cap?: Cap): Promise<Me> {
  const me = await getMe();
  if (!me) redirect("/login");
  if (cap && !me.can(cap)) redirect("/?refus=" + cap);
  return me;
}
