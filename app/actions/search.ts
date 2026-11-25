"use server";
import { getMe } from "@/lib/auth";
import { q } from "@/lib/erp";

export async function searchClients(term: string) {
  const me = await getMe();
  if (!me || term.trim().length < 2) return [];
  return q(me, `select id, name, phone, company from erp.v_clients where name ilike $1 or company ilike $1 or phone = erp.normalize_phone($2)
    or (length(regexp_replace($2, '\\D', '', 'g')) >= 4 and phone like '%' || regexp_replace($2, '\\D', '', 'g') || '%') order by name limit 10`, [`%${term.trim()}%`, term]);
}
