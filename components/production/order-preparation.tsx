"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveOrderPreparation } from "@/lib/actions/operations-actions";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { businessDate } from "@/lib/finance";

export function OrderPreparation({
  orderId,
  preparation,
  canEdit,
}: {
  orderId: string;
  preparation: {
    due_date?: string | null;
    bat_status?: string;
    blocked_reason?: string | null;
    quality_checked?: boolean;
    packaging_checked?: boolean;
  };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const late = !!preparation.due_date && preparation.due_date < businessDate();
  return (
    <Card className="p-5 mb-6">
      <h2 className="font-semibold mb-2">Préparation & contrôle</h2>
      <p className="text-sm text-slate-500 mb-4">
        Suivez la date promise, le bon à tirer et les contrôles avant remise au
        client.
      </p>
      {late && (
        <p role="status" className="text-amber-700 mb-3">
          La date promise est dépassée.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setError(null);
          setSaved(false);
          startTransition(async () => {
            try {
              await saveOrderPreparation(orderId, data);
              setSaved(true);
              router.refresh();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Enregistrement impossible.",
              );
            }
          });
        }}
      >
        <fieldset disabled={!canEdit || pending} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Date promise" htmlFor="due_date">
              <input
                id="due_date"
                name="due_date"
                type="date"
                defaultValue={preparation.due_date || ""}
                className={inputClass}
              />
            </Field>
            <Field label="Validation du visuel (BAT)" htmlFor="bat_status">
              <select
                id="bat_status"
                name="bat_status"
                defaultValue={preparation.bat_status || "a_preparer"}
                className={inputClass}
              >
                <option value="a_preparer">À préparer</option>
                <option value="envoye">Envoyé au client</option>
                <option value="valide">Validé par le client</option>
                <option value="non_requis">Non requis</option>
              </select>
            </Field>
          </div>
          <Field label="Blocage / action nécessaire" htmlFor="blocked_reason">
            <textarea
              id="blocked_reason"
              name="blocked_reason"
              defaultValue={preparation.blocked_reason || ""}
              maxLength={2000}
              placeholder="Ex. polos taille L manquants, logo à vectoriser…"
              className={inputClass}
            />
          </Field>
          <div className="flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2">
              <input
                name="quality_checked"
                type="checkbox"
                defaultChecked={preparation.quality_checked}
              />{" "}
              Qualité contrôlée
            </label>
            <label className="flex items-center gap-2">
              <input
                name="packaging_checked"
                type="checkbox"
                defaultChecked={preparation.packaging_checked}
              />{" "}
              Tailles, quantités et emballage vérifiés
            </label>
          </div>
          {error && (
            <p role="alert" className="text-red-600">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="text-green-700">
              Préparation enregistrée.
            </p>
          )}
          {canEdit && (
            <Button type="submit">
              {pending ? "Enregistrement…" : "Enregistrer la préparation"}
            </Button>
          )}
        </fieldset>
      </form>
    </Card>
  );
}
