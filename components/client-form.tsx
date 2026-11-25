"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ActionForm, SubmitButton, type ActionResult } from "./forms";
import { Field, inputCls } from "./ui";
import { checkDuplicates } from "@/app/actions/clients";
import { SOURCES } from "@/lib/format";

type Staff = { id: string; full_name: string };
export function ClientForm({ action, staff, client, submitLabel }: { action: (p: ActionResult, fd: FormData) => Promise<ActionResult>; staff: Staff[]; client?: any; submitLabel: string }) {
  const [name, setName] = useState(client?.name || "");
  const [phone, setPhone] = useState(client?.phone_raw || client?.phone || "");
  const [dups, setDups] = useState<any[]>([]);
  const [optOut, setOptOut] = useState(!!client?.marketing_opt_out);
  useEffect(() => {
    const t = setTimeout(async () => {
      if (name.trim().length < 2 && phone.replace(/\D/g, "").length < 8) return setDups([]);
      setDups(await checkDuplicates(name, phone, client?.id));
    }, 350);
    return () => clearTimeout(t);
  }, [name, phone, client?.id]);
  return (
    <ActionForm action={action} className="grid gap-3 sm:grid-cols-2">
      {client && <input type="hidden" name="id" value={client.id} />}
      <Field label="Nom *"><input name="name" required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
      <Field label="Téléphone" hint="+213, 0 ou espaces : normalisé automatiquement"><input name="phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} /></Field>
      {dups.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2">
          <strong>Doublon possible :</strong>
          <ul className="mt-1 space-y-0.5">{dups.map((d) => <li key={d.id}><Link href={`/clients/${d.id}`} className="underline">{d.name}</Link> — {d.phone || "sans téléphone"} ({d.match === "telephone" ? "même numéro" : "même nom"})</li>)}</ul>
          {dups.some((d) => d.match === "telephone") && <p className="mt-1 text-xs">Ce numéro existe déjà : ouvrez la fiche existante plutôt que d'en créer une nouvelle.</p>}
        </div>
      )}
      <Field label="Société / club"><input name="company" defaultValue={client?.company || ""} className={inputCls} /></Field>
      <Field label="Source"><select name="source" defaultValue={client?.source || "instagram"} className={inputCls}>{SOURCES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select></Field>
      <Field label="Commercial assigné"><select name="owner_id" defaultValue={client?.owner_id || ""} className={inputCls}><option value="">Moi</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></Field>
      <Field label="Préférence de contact"><select name="contact_pref" defaultValue={client?.contact_pref || "whatsapp"} className={inputCls}><option value="whatsapp">WhatsApp</option><option value="appel">Appel</option><option value="sms">SMS</option><option value="email">E-mail</option></select></Field>
      <Field label="E-mail"><input name="email" type="email" defaultValue={client?.email || ""} className={inputCls} /></Field>
      <Field label="Wilaya"><input name="wilaya" defaultValue={client?.wilaya || ""} className={inputCls} /></Field>
      <Field label="Commune"><input name="commune" defaultValue={client?.commune || ""} className={inputCls} /></Field>
      <Field label="Adresse"><input name="address" defaultValue={client?.address || ""} className={inputCls} /></Field>
      <Field label="Notes" className="sm:col-span-2"><textarea name="notes" rows={2} defaultValue={client?.notes || ""} className={inputCls} /></Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="marketing_opt_out" checked={optOut} onChange={(e) => setOptOut(e.target.checked)} /> Refuse les relances marketing</label>
      {optOut && <Field label="Motif du refus" className="sm:col-span-2"><input name="opt_out_reason" defaultValue={client?.opt_out_reason || ""} className={inputCls} /></Field>}
      <div className="sm:col-span-2"><SubmitButton>{submitLabel}</SubmitButton></div>
    </ActionForm>
  );
}
