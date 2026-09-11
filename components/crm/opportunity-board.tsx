"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { updateOpportunityStage } from "@/lib/actions/entity-actions";
import { Card, inputClass } from "@/components/ui";
import { formatMoney, formatDate } from "@/lib/utils";
import { crmStages, whatsappUrl } from "@/lib/crm";

interface OpportunityRow {
  id: string;
  title: string;
  stage: string;
  amount: number;
  contact_id: string | null;
  contacts: { name: string; phone: string | null } | null;
  next_action: string | null;
  next_follow_up: string | null;
  owner_id: string | null;
}
export function OpportunityBoard({
  opportunities,
  today,
  userId,
}: {
  opportunities: OpportunityRow[];
  today: string;
  userId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("open");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const open = opportunities.filter(
    (o) => !["gagne", "perdu"].includes(o.stage),
  );
  const due = (o: OpportunityRow) =>
    !!o.next_follow_up &&
    o.next_follow_up <= today &&
    !["gagne", "perdu"].includes(o.stage);
  const visible = opportunities.filter((o) => {
    const matches =
      `${o.title} ${o.contacts?.name ?? ""} ${o.contacts?.phone ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase());
    return (
      matches &&
      (filter === "all" ||
        (filter === "due"
          ? due(o)
          : filter === "mine"
            ? o.owner_id === userId && open.includes(o)
            : filter === "unplanned"
              ? !o.next_follow_up && open.includes(o)
              : open.includes(o)))
    );
  });
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Opportunités ouvertes", open.length],
          [
            "Potentiel commercial",
            formatMoney(open.reduce((s, o) => s + Number(o.amount), 0)),
          ],
          ["À relancer aujourd’hui", opportunities.filter(due).length],
        ].map(([label, value]) => (
          <Card key={label} className="p-5">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="text-2xl font-semibold mt-2">{value}</p>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Rechercher une opportunité"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Client, téléphone ou projet…"
          className={`${inputClass} sm:max-w-sm`}
        />
        <select
          aria-label="Filtrer les opportunités"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={`${inputClass} sm:max-w-xs`}
        >
          <option value="open">En cours</option>
          <option value="due">À relancer</option>
          <option value="unplanned">Sans date de relance</option>
          <option value="mine">Mes opportunités en cours</option>
          <option value="all">Toutes, y compris clôturées</option>
        </select>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
        {crmStages
          .filter(
            (s) => filter === "all" || !["gagne", "perdu"].includes(s.value),
          )
          .map((stage) => {
            const items = visible.filter((o) => o.stage === stage.value);
            return (
              <section
                key={stage.value}
                className="min-w-0 rounded-xl bg-slate-100 dark:bg-slate-900 p-3"
              >
                <div className="flex justify-between gap-2 mb-3">
                  <h2 className="font-semibold text-sm">
                    {stage.label} · {items.length}
                  </h2>
                  <span className="text-sm text-slate-500">
                    {formatMoney(
                      items.reduce((s, o) => s + Number(o.amount), 0),
                    )}
                  </span>
                </div>
                <div className="space-y-3">
                  {items.map((o) => {
                    const whatsapp = whatsappUrl(o.contacts?.phone);
                    return (
                      <Card key={o.id} className="p-4 space-y-2">
                        <Link
                          href={`/crm/opportunities/${o.id}`}
                          className="font-semibold hover:underline break-words"
                        >
                          {o.title}
                        </Link>
                        <p className="text-sm text-slate-500">
                          {o.contacts?.name ?? "Client à renseigner"}
                        </p>
                        <p className="font-semibold">{formatMoney(o.amount)}</p>
                        <p className="text-sm">
                          {o.next_action || "Prochaine action à définir"}
                        </p>
                        <p
                          className={`text-sm ${due(o) ? "text-red-600 dark:text-red-400 font-medium" : "text-slate-500"}`}
                        >
                          {o.next_follow_up
                            ? `Relance : ${formatDate(o.next_follow_up)}`
                            : "Aucune relance planifiée"}
                        </p>
                        <div className="flex flex-wrap gap-4 text-sm">
                          {o.contact_id && (
                            <Link
                              href={`/crm/contacts/${o.contact_id}`}
                              className="text-brand-600 hover:underline"
                            >
                              Fiche client
                            </Link>
                          )}
                          {whatsapp && (
                            <a
                              href={whatsapp}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-700 dark:text-emerald-400 hover:underline"
                            >
                              Ouvrir WhatsApp
                            </a>
                          )}
                        </div>
                        <select
                          aria-label={`Étape de ${o.title}`}
                          value={o.stage}
                          disabled={pending}
                          className={inputClass}
                          onChange={(e) => {
                            const value = e.target.value;
                            setError("");
                            startTransition(async () => {
                              try {
                                await updateOpportunityStage(o.id, value);
                              } catch {
                                setError(
                                  "Changement refusé. Vérifiez vos droits et réessayez.",
                                );
                              }
                            });
                          }}
                        >
                          {crmStages.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </Card>
                    );
                  })}
                  {items.length === 0 && (
                    <p className="text-sm text-slate-500 py-6 text-center">
                      Aucune opportunité
                    </p>
                  )}
                </div>
              </section>
            );
          })}
      </div>
    </div>
  );
}
