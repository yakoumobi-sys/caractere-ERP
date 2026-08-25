"use client";

import { useEffect, useState } from "react";
import { createYalidineShipmentForOrder, fetchYalidineWilayas } from "@/lib/actions/yalidine-actions";
import { Card, Button, Badge, Field, inputClass } from "@/components/ui";

interface Shipment {
  yalidine_tracking_id: string;
  status: "pending" | "in_transit" | "delivered" | "failed" | "cancelled";
  failure_reason?: string | null;
  delivered_at?: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; tone: "slate" | "green" | "amber" | "red" | "blue" }> = {
  pending: { label: "En attente", tone: "amber" },
  in_transit: { label: "En route", tone: "blue" },
  delivered: { label: "Livrée", tone: "green" },
  failed: { label: "Échec de livraison", tone: "red" },
  cancelled: { label: "Annulée", tone: "slate" },
};

/**
 * Création et suivi réel d'une expédition Yalidine pour une commande prête à
 * livrer. La création appelle la vraie API Yalidine (colis physique engagé) —
 * n'est déclenchée que par ce bouton, jamais automatiquement. Le statut est
 * ensuite rafraîchi par le cron de synchronisation (app/api/cron/sync-yalidine).
 */
export function YalidineShipmentPanel({ orderId, shipment }: { orderId: string; shipment: Shipment | null }) {
  const [wilayas, setWilayas] = useState<{ id: number; name: string }[]>([]);
  const [loadingWilayas, setLoadingWilayas] = useState(!shipment);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (shipment) return;
    fetchYalidineWilayas()
      .then(setWilayas)
      .catch(() => setWilayas([]))
      .finally(() => setLoadingWilayas(false));
  }, [shipment]);

  if (shipment) {
    const config = STATUS_CONFIG[shipment.status] ?? STATUS_CONFIG.pending;
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-slate-900">📦 Expédition Yalidine</h2>
          <Badge tone={config.tone}>{config.label}</Badge>
        </div>
        <p className="text-sm text-slate-600 font-mono">{shipment.yalidine_tracking_id}</p>
        {shipment.status === "failed" && shipment.failure_reason && (
          <p className="text-xs text-red-600 mt-1">Motif : {shipment.failure_reason}</p>
        )}
        <a
          href={`https://yalidine.app/app/bordereau.php?tracking=${shipment.yalidine_tracking_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-brand-600 hover:underline mt-2 inline-block"
        >
          Voir le bordereau →
        </a>
      </Card>
    );
  }

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    try {
      await createYalidineShipmentForOrder(orderId, formData);
      window.location.reload();
    } catch (e) {
      alert("❌ " + (e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">📦 Créer l&apos;expédition Yalidine</h2>
      <form action={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Wilaya" htmlFor="to_wilaya_name" required>
          <select id="to_wilaya_name" name="to_wilaya_name" required disabled={loadingWilayas} className={inputClass}>
            <option value="">{loadingWilayas ? "Chargement…" : "— Sélectionner —"}</option>
            {wilayas.map((w) => (
              <option key={w.id} value={w.name}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Commune" htmlFor="to_commune_name" required>
          <input id="to_commune_name" name="to_commune_name" required className={inputClass} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Adresse" htmlFor="address" required>
            <input id="address" name="address" required className={inputClass} />
          </Field>
        </div>
        <Field label="Montant à collecter (DA)" htmlFor="price" required>
          <input id="price" name="price" type="number" step="1" min="0" required className={inputClass} />
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Création…" : "Créer l'expédition"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
