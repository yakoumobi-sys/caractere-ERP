import { requireMe } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { CsvImport } from "@/components/csv-import";
import { importStock, previewStockImport } from "@/app/actions/stock";

export default async function ImportStock() {
  await requireMe("stock_edit");
  return (
    <div className="max-w-4xl">
      <PageHeader title="Importer le stock" subtitle="Colonnes : reference, designation, type (vetement/consommable), couleur, taille, quantite, seuil, prix, cout" />
      <Card>
        <CsvImport preview={previewStockImport} commit={importStock} columns={[["ref", "Réf."], ["name", "Désignation"], ["color", "Couleur"], ["size", "Taille"], ["qty", "Qté"], ["current_physical", "Stock actuel"]]}
          extra={<label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" name="mode" value="inventaire" /> Mettre à jour les articles existants (inventaire : la quantité du fichier remplace le stock physique)</label>} />
        <p className="mt-3 text-xs text-slate-500">Nouveaux articles : la quantité est enregistrée en réception « Import initial ». Doublons du fichier et lignes invalides ignorés. Modèle : <a className="underline" href="/modeles/stock.csv">stock.csv</a></p>
      </Card>
    </div>
  );
}
