import { requireMe, AUTH_MODE } from "@/lib/auth";
import { q } from "@/lib/erp";
import { Badge, Card, Field, PageHeader, inputCls } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { saveCompany, saveMachine, saveStaff } from "@/app/actions/settings";
import { ROLES } from "@/lib/perms";
import { yalidineConfigured } from "@/lib/yalidine";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const me = await requireMe("settings");
  const [rows, staff, machines] = await Promise.all([
    q(me, "select key, value from erp.v_settings"),
    q(me, "select * from erp.v_staff order by active desc, full_name"),
    q(me, "select * from erp.v_machines order by kind, name"),
  ]);
  const S = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
  const co = S.company || {};
  const txt = (k: string) => (typeof S[k] === "string" ? S[k] : S[k] ?? "");
  return (
    <div className="space-y-4">
      <PageHeader title="Réglages" subtitle="Identité, fiscalité, numérotation, équipe et machines" />
      <Card title="Identité Caractère, fiscalité et numérotation">
        <p className="mb-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">À renseigner à partir des documents de référence validés par Caractère (NIF, NIS, RC, AI, RIB, mentions, taux). Les documents déjà émis restent figés.</p>
        <ActionForm action={saveCompany} className="grid gap-3 sm:grid-cols-3">
          {[["name", "Nom commercial"], ["legal_name", "Raison sociale"], ["activity", "Activité"], ["address", "Adresse"], ["phone", "Téléphone"], ["email", "E-mail"], ["nif", "NIF"], ["nis", "NIS"], ["rc", "RC"], ["ai", "Article d'imposition"], ["rib", "RIB"], ["logo_url", "URL du logo"]].map(([k, l]) => (
            <Field key={k} label={l}><input name={k} defaultValue={co[k] || ""} className={inputCls} /></Field>
          ))}
          <Field label="Mentions légales (pied de document)" className="sm:col-span-3"><textarea name="legal_mentions" rows={2} defaultValue={txt("legal_mentions")} className={inputCls} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="tva_enabled" defaultChecked={txt("tva_enabled") !== "false"} /> TVA applicable</label>
          <Field label="Taux de TVA (%)"><input name="tva_rate" defaultValue={txt("tva_rate")} className={inputCls} /></Field>
          <Field label="Acompte par défaut (%)"><input name="default_deposit_pct" defaultValue={txt("default_deposit_pct")} className={inputCls} /></Field>
          <Field label="Préfixe des références"><input name="ref_prefix" defaultValue={txt("ref_prefix")} className={inputCls} /></Field>
          <Field label="Préfixe devis"><input name="prefix_devis" defaultValue={txt("prefix_devis")} className={inputCls} /></Field>
          <Field label="Préfixe factures"><input name="prefix_facture" defaultValue={txt("prefix_facture")} className={inputCls} /></Field>
          <Field label="Préfixe BL"><input name="prefix_bl" defaultValue={txt("prefix_bl")} className={inputCls} /></Field>
          <Field label="Préfixe reçus"><input name="prefix_recu" defaultValue={txt("prefix_recu")} className={inputCls} /></Field>
          <Field label="Délai promis par défaut (jours)"><input name="default_promised_days" defaultValue={txt("default_promised_days")} className={inputCls} /></Field>
          <Field label="Validité des devis (jours)"><input name="quote_validity_days" defaultValue={txt("quote_validity_days")} className={inputCls} /></Field>
          <Field label="Relance devis sans réponse (jours)"><input name="quote_followup_days" defaultValue={txt("quote_followup_days")} className={inputCls} /></Field>
          <Field label="Réactivation après (jours)"><input name="reactivation_days" defaultValue={txt("reactivation_days")} className={inputCls} /></Field>
          <Field label="Largeur max T-shirt caractérisé (cm)"><input name="characterized_max_width_cm" defaultValue={txt("characterized_max_width_cm")} className={inputCls} /></Field>
          <Field label="Texte de l'offre fidélité" className="sm:col-span-2"><input name="loyalty_offer_text" defaultValue={txt("loyalty_offer_text")} className={inputCls} /></Field>
          <Field label="Photo du T-shirt caractérisé (URL)"><input name="loyalty_photo_url" defaultValue={txt("loyalty_photo_url")} className={inputCls} /></Field>
          <Field label="Montant minimum pour la carte (DA)"><input name="loyalty_min_order" defaultValue={txt("loyalty_min_order")} className={inputCls} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="loyalty_on_counter" defaultChecked={txt("loyalty_on_counter") === "true"} /> Carte aussi pour les ventes comptoir</label>
          <div className="sm:col-span-3"><SubmitButton>Enregistrer les réglages</SubmitButton></div>
        </ActionForm>
      </Card>

      <Card title="Équipe et droits">
        <p className="mb-3 text-xs text-slate-500">{AUTH_MODE === "supabase" ? "Créez le compte dans Supabase Auth avec le même e-mail : il est rattaché automatiquement à la première connexion." : "Mode démo : la connexion se fait par choix du profil."}</p>
        <div className="space-y-2">
          {[...staff, { id: "", full_name: "", roles: [], active: true }].map((s: any) => (
            <details key={s.id || "new"} className="rounded-lg border border-slate-200 p-2" open={!s.id && false}>
              <summary className="cursor-pointer text-sm">{s.id ? <>{s.full_name} {s.roles.map((r: string) => <Badge key={r}>{ROLES[r]}</Badge>)} {s.can_validate_first_piece && <Badge tone="green">1re pièce</Badge>} {!s.active && <Badge tone="red">inactif</Badge>}</> : <span className="text-brand-700">+ Ajouter un membre</span>}</summary>
              <ActionForm action={saveStaff} className="mt-2 grid gap-2 sm:grid-cols-3">
                <input type="hidden" name="id" value={s.id} />
                <input name="full_name" required defaultValue={s.full_name} placeholder="Nom" className={inputCls} />
                <input name="email" type="email" defaultValue={s.email || ""} placeholder="E-mail de connexion" className={inputCls} />
                <input name="phone" defaultValue={s.phone || ""} placeholder="Téléphone" className={inputCls} />
                <div className="flex flex-wrap gap-3 sm:col-span-3">{Object.entries(ROLES).map(([k, v]) => <label key={k} className="flex items-center gap-1 text-sm"><input type="checkbox" name="roles" value={k} defaultChecked={s.roles.includes(k)} />{v}</label>)}</div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="can_validate_first_piece" defaultChecked={s.can_validate_first_piece} /> Habilité à valider la 1re pièce</label>
                <select name="active" defaultValue={s.active ? "on" : "off"} className={inputCls}><option value="on">Actif</option><option value="off">Inactif</option></select>
                <SubmitButton variant="secondary">Enregistrer</SubmitButton>
              </ActionForm>
            </details>
          ))}
        </div>
      </Card>

      <Card title="Machines (laize DTF)">
        <div className="space-y-2">
          {[...machines, { id: "", name: "", kind: "dtf", laize_cm: "", active: true }].map((m: any) => (
            <ActionForm key={m.id || "new"} action={saveMachine} className="grid gap-2 sm:grid-cols-5">
              <input type="hidden" name="id" value={m.id} />
              <input name="name" required defaultValue={m.name} placeholder="Nouvelle machine" className={inputCls} />
              <select name="kind" defaultValue={m.kind} className={inputCls}><option value="dtf">Imprimante DTF</option><option value="presse">Presse</option><option value="brodeuse">Brodeuse</option></select>
              <input name="laize_cm" defaultValue={m.laize_cm ?? ""} placeholder="Laize (cm)" className={inputCls} />
              <select name="active" defaultValue={m.active ? "on" : "off"} className={inputCls}><option value="on">Active</option><option value="off">Inactive</option></select>
              <SubmitButton variant="secondary">{m.id ? "Enregistrer" : "Ajouter"}</SubmitButton>
            </ActionForm>
          ))}
        </div>
      </Card>

      <Card title="Intégrations">
        <ul className="space-y-1 text-sm">
          <li>Authentification : <Badge tone={AUTH_MODE === "supabase" ? "green" : "amber"}>{AUTH_MODE === "supabase" ? "Supabase Auth" : "démo"}</Badge></li>
          <li>Fichiers clients : <Badge tone={process.env.SUPABASE_SERVICE_ROLE_KEY ? "green" : "amber"}>{process.env.SUPABASE_SERVICE_ROLE_KEY ? "Supabase Storage (bucket privé)" : "disque local (.data/files)"}</Badge></li>
          <li>API Yalidine : <Badge tone={yalidineConfigured() ? "green" : "amber"}>{yalidineConfigured() ? "configurée" : "saisie manuelle du tracking et des statuts"}</Badge></li>
          <li>Webhook Yalidine : <code className="text-xs">POST /api/webhooks/yalidine</code> <Badge tone={process.env.YALIDINE_WEBHOOK_SECRET ? "green" : "amber"}>{process.env.YALIDINE_WEBHOOK_SECRET ? "secret défini" : "YALIDINE_WEBHOOK_SECRET manquant"}</Badge></li>
        </ul>
      </Card>
    </div>
  );
}
