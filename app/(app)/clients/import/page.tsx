import { requireMe } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { CsvImport } from "@/components/csv-import";
import { importClients, previewClientImport } from "@/app/actions/clients";

export default async function ImportClients() {
  await requireMe("clients_edit");
  return (
    <div className="max-w-4xl">
      <PageHeader title="Importer des clients" subtitle="CSV séparé par ; ou ,  — colonnes : nom, telephone, societe, email, wilaya, commune, adresse, source, type (client/prospect), refus marketing (oui/non)" />
      <Card>
        <CsvImport preview={previewClientImport} commit={importClients} columns={[["name", "Nom"], ["phone", "Téléphone"], ["phone_normalized", "Normalisé"], ["company", "Société"], ["source", "Source"]]} />
        <p className="mt-3 text-xs text-slate-500">Les numéros sont normalisés (+213). Les doublons (dans le fichier ou déjà en base) et les lignes invalides sont ignorés. Modèle : <a className="underline" href="/modeles/clients.csv">clients.csv</a></p>
      </Card>
    </div>
  );
}
