import { createClient } from "@/lib/supabase/server";
import { updateCompany } from "@/lib/actions/settings-actions";
import { Button, Card, Field, PageHeader, inputClass } from "@/components/ui";

export default async function Page() {
  const supabase = createClient();
  const { data: company } = await supabase.from("companies").select("*").limit(1).single();

  async function submit(formData: FormData) {
    "use server";
    if (company?.id) await updateCompany(company.id, formData);
  }

  return (
    <div className="max-w-xl">
      <PageHeader title="Société" description="Informations légales de l'entreprise" />
      <Card className="p-6">
        <form action={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field label="Nom" htmlFor="name" required>
              <input id="name" name="name" defaultValue={company?.name ?? ""} required className={inputClass} />
            </Field>
          </div>
          <Field label="SIRET" htmlFor="siret">
            <input id="siret" name="siret" defaultValue={company?.siret ?? ""} className={inputClass} />
          </Field>
          <Field label="Email" htmlFor="email">
            <input id="email" name="email" type="email" defaultValue={company?.email ?? ""} className={inputClass} />
          </Field>
          <Field label="Téléphone" htmlFor="phone">
            <input id="phone" name="phone" defaultValue={company?.phone ?? ""} className={inputClass} />
          </Field>
          <Field label="Pays" htmlFor="country">
            <input id="country" name="country" defaultValue={company?.country ?? "France"} className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Adresse" htmlFor="address">
              <input id="address" name="address" defaultValue={company?.address ?? ""} className={inputClass} />
            </Field>
          </div>
          <Field label="Ville" htmlFor="city">
            <input id="city" name="city" defaultValue={company?.city ?? ""} className={inputClass} />
          </Field>
          <Field label="Code postal" htmlFor="postal_code">
            <input id="postal_code" name="postal_code" defaultValue={company?.postal_code ?? ""} className={inputClass} />
          </Field>
          <div className="sm:col-span-2 pt-2">
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
