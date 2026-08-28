"use client";

import { useState } from "react";
import { sendOrderSMS } from "@/app/actions/sms";
import { Button, Card } from "@/components/ui";

export function SMSSender({
  orderId,
  orderNumber,
  customerPhone,
}: {
  orderId: string;
  orderNumber?: string;
  customerPhone?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedStage, setSelectedStage] = useState("production");
  const [message, setMessage] = useState("");

  const stages = [
    { value: "production", label: "📦 Commande en production" },
    { value: "ready_for_shipment", label: "🚚 Prête à livrer" },
    { value: "in_transit", label: "✈️ En route" },
    { value: "arrived_wilaya", label: "📍 Arrivée à wilaya" },
    { value: "delivered", label: "✅ Livrée" },
    { value: "delivery_failed_1", label: "⚠️ Tentative 1 échouée" },
    { value: "delivery_failed_2", label: "⚠️ Tentative 2 échouée" },
    { value: "delivery_failed_3", label: "⚠️ Tentative 3 échouée" },
    { value: "delivery_failed_final", label: "❌ Échec final" },
  ];

  async function handleSend() {
    if (!customerPhone) {
      alert("❌ Numéro client manquant");
      return;
    }

    setLoading(true);
    try {
      const result = await sendOrderSMS({
        orderId,
        customerId: orderId,
        customerPhone,
        stage: selectedStage as any,
        orderNumber,
      });

      if (result.success) {
        alert("✅ SMS envoyé avec succès!");
        setIsOpen(false);
      } else {
        alert(`❌ Erreur: ${result.error}`);
      }
    } catch (error) {
      alert(`❌ Erreur: ${error}`);
    } finally {
      setLoading(false);
    }
  }

  if (!customerPhone) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setIsOpen(true)}
        className="w-full"
      >
        📱 Envoyer SMS Client
      </Button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">📱 Envoyer SMS</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Numéro: {customerPhone}
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Stage
                </label>
                <select
                  value={selectedStage}
                  onChange={(e) => setSelectedStage(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                >
                  {stages.map((stage) => (
                    <option key={stage.value} value={stage.value}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleSend}
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? "Envoi..." : "Envoyer"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsOpen(false)}
                  disabled={loading}
                  className="flex-1"
                >
                  Annuler
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
