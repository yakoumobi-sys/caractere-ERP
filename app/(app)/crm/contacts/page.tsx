import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Button,
  Card,
  Field,
  LinkButton,
  PageHeader,
  inputClass,
} from "@/components/ui";
import { whatsappUrl } from "@/lib/crm";
export default async function Page({
  searchParams,
}: {
  searchParams: { q?: string; type?: string; page?: string };
}) {
  const q = (searchParams.q ?? "")
    .replace(/[%_,().]/g, " ")
    .trim()
    .slice(0, 100);
  const type = ["client", "prospect", "fournisseur", "autre"].includes(
    searchParams.type ?? "",
  )
    ? searchParams.type!
    : "";
  const page = Math.max(1, Math.floor(Number(searchParams.page) || 1));
  let query = createClient()
    .from("contacts")
    .select("id,name,company_name,phone,email,type,city", { count: "exact" });
  if (q)
    query = query.or(
      `name.ilike.%${q}%,company_name.ilike.%${q}%,phone.ilike.%${q}%`,
    );
  if (type) query = query.eq("type", type);
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * 30, page * 30 - 1);
  const url = (n: number) =>
    `/crm/contacts?${new URLSearchParams({ q, type, page: String(n) })}`;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Clients & prospects"
        action={
          <LinkButton href="/crm/contacts/new">+ Nouveau contact</LinkButton>
        }
      />
      <form className="flex flex-wrap items-end gap-3">
        <Field label="Rechercher" htmlFor="q">
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Nom, entreprise, téléphone…"
            className={inputClass}
          />
        </Field>
        <Field label="Type" htmlFor="type">
          <select
            id="type"
            name="type"
            defaultValue={type}
            className={inputClass}
          >
            <option value="">Tous</option>
            <option value="client">Clients</option>
            <option value="prospect">Prospects</option>
            <option value="fournisseur">Fournisseurs</option>
            <option value="autre">Autres</option>
          </select>
        </Field>
        <Button variant="secondary" type="submit">
          Rechercher
        </Button>
      </form>
      <Card className="overflow-x-auto">
        {error ? (
          <p role="alert" className="p-5 text-red-600">
            Impossible de charger les contacts.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left bg-slate-50 dark:bg-slate-900 border-b">
              <tr>
                {[
                  "Contact",
                  "Entreprise",
                  "Téléphone",
                  "Ville",
                  "Type",
                  "Action",
                ].map((h) => (
                  <th key={h} className="p-4 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-slate-100 dark:border-slate-700"
                >
                  <td className="p-4">
                    <Link
                      href={`/crm/contacts/${c.id}`}
                      className="text-brand-600 font-semibold hover:underline"
                    >
                      {c.name}
                    </Link>
                    <p className="text-slate-500">{c.email}</p>
                  </td>
                  <td className="p-4">{c.company_name || "—"}</td>
                  <td className="p-4 whitespace-nowrap">{c.phone || "—"}</td>
                  <td className="p-4">{c.city || "—"}</td>
                  <td className="p-4">{c.type}</td>
                  <td className="p-4">
                    {whatsappUrl(c.phone) && (
                      <a
                        className="text-emerald-700 dark:text-emerald-400 hover:underline"
                        href={whatsappUrl(c.phone)!}
                        target="_blank"
                        rel="noreferrer"
                      >
                        WhatsApp
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!error && !data?.length && (
          <p className="p-8 text-slate-500 text-center">
            Aucun contact pour ces critères.
          </p>
        )}
      </Card>
      <div className="flex justify-between gap-3 text-sm">
        <span>
          {count ?? 0} contact(s) · Page {page}
        </span>
        <div className="flex gap-4">
          {page > 1 && <Link href={url(page - 1)}>Précédente</Link>}
          {page * 30 < (count ?? 0) && (
            <Link href={url(page + 1)}>Suivante</Link>
          )}
        </div>
      </div>
    </div>
  );
}
