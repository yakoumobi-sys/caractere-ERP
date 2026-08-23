"use client";

import { updateYalidineStatus } from "@/lib/actions/employee-actions";
import { Card, Button, Badge } from "@/components/ui";

interface YalidineShipment {
  id: string;
  yalidine_tracking_id: string;
  status: "pending" | "in_transit" | "delivered" | "failed" | "cancelled";
  delivered_at?: string;
  attempted_at?: string;
  failure_reason?: string;
  created_at: string;
}

const statusConfig: Record<string, { label: string; tone: string; icon: string }> = {
  pending: { label: "En attente", tone: "gray", icon: "⏳" },
  in_transit: { label: "En route", tone: "blue", icon: "🚚" },
  delivered: { label: "Livrée", tone: "green", icon: "✅" },
  failed: { label: "Échouée", tone: "red", icon: "❌" },
  cancelled: { label: "Annulée", tone: "slate", icon: "⛔" },
};

export function YalidineTracker({ shipments }: { shipments: YalidineShipment[] }) {
  const handleStatusUpdate = async (trackingId: string, newStatus: string) => {
    try {
      await updateYalidineStatus(trackingId, newStatus);
      alert("✅ Statut mis à jour");
      window.location.reload();
    } catch (error) {
      alert("❌ Erreur: " + (error as Error).message);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">📦 Suivi Yalidine</h2>

      {shipments.length === 0 ? (
        <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-8">
          Aucun suivi Yalidine
        </p>
      ) : (
        <div className="space-y-3">
          {shipments.map((shipment) => {
            const config = statusConfig[shipment.status];
            return (
              <div
                key={shipment.id}
                className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{config.icon}</span>
                    <div>
                      <p className="font-mono text-sm text-slate-700 dark:text-slate-300">
                        {shipment.yalidine_tracking_id}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(shipment.created_at).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                  </div>
                  <Badge tone={config.tone as any}>{config.label}</Badge>
                </div>

                {shipment.failure_reason && (
                  <p className="text-xs text-red-600 dark:text-red-400 mb-2">
                    Raison: {shipment.failure_reason}
                  </p>
                )}

                <div className="flex gap-2 text-xs">
                  {shipment.status !== "delivered" && shipment.status !== "cancelled" && (
                    <>
                      {shipment.status === "pending" && (
                        <Button
                          size="xs"
                          onClick={() => handleStatusUpdate(shipment.yalidine_tracking_id, "in_transit")}
                        >
                          Marquer en route
                        </Button>
                      )}
                      {shipment.status === "in_transit" && (
                        <Button
                          size="xs"
                          onClick={() => handleStatusUpdate(shipment.yalidine_tracking_id, "delivered")}
                        >
                          Marquer livrée
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="secondary"
                        onClick={() => handleStatusUpdate(shipment.yalidine_tracking_id, "failed")}
                      >
                        Échouée
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
