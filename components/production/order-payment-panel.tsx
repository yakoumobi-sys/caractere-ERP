"use client";

import { useState } from "react";
import { recordOrderPayment, getOrderPaymentInfo } from "@/lib/actions/payment-actions";
import { Card, Button, Field, inputClass, Badge } from "@/components/ui";

interface OrderPaymentPanelProps {
  orderId: string;
  orderNumber: string;
  orderTotal: number | null;
  clientName: string;
  clientBalance: number | null;
}

export function OrderPaymentPanel({
  orderId,
  orderNumber,
  orderTotal,
  clientName,
  clientBalance,
}: OrderPaymentPanelProps) {
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleAddPayment = async () => {
    setError("");
    setSuccess("");

    const amountNum = Number(amount);
    if (!amount || amountNum <= 0) {
      setError("Veuillez entrer un montant positif");
      return;
    }

    setLoading(true);
    try {
      await recordOrderPayment(orderId, amountNum, paymentMethod);
      setSuccess(`✅ Paiement de ${amountNum} DA enregistré`);
      setAmount("");
      // Reload data would happen here in real app
      window.location.reload();
    } catch (err) {
      setError("❌ " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const remaining = orderTotal ? orderTotal - (clientBalance || 0) : null;
  const isFullyPaid = remaining !== null && remaining <= 0;

  return (
    <div className="space-y-6">
      {/* Résumé du paiement */}
      <Card className="p-6 bg-gradient-to-br from-blue-50 to-blue-100">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-slate-600 mb-1">Total</p>
            <p className="text-2xl font-bold text-slate-900">
              {orderTotal ? `${orderTotal.toLocaleString()} DA` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-600 mb-1">Versé</p>
            <p className="text-2xl font-bold text-green-600">
              {clientBalance !== null ? `${Math.max(0, orderTotal ? orderTotal - clientBalance : 0).toLocaleString()} DA` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-600 mb-1">Restant</p>
            <p className={`text-2xl font-bold ${isFullyPaid ? "text-green-600" : "text-red-600"}`}>
              {remaining !== null ? `${Math.max(0, remaining).toLocaleString()} DA` : "—"}
            </p>
          </div>
        </div>

        {isFullyPaid && (
          <div className="mt-4 p-3 bg-green-200 border border-green-400 rounded text-sm text-green-900 font-medium">
            ✅ Commande entièrement payée
          </div>
        )}
      </Card>

      {/* Client info */}
      <Card className="p-4">
        <p className="text-sm text-slate-600">Commande</p>
        <p className="text-lg font-semibold text-slate-900">{orderNumber}</p>
        <p className="text-sm text-slate-600 mt-2">Client</p>
        <p className="text-lg font-semibold text-slate-900">{clientName}</p>
      </Card>

      {/* Ajouter un paiement */}
      {!isFullyPaid && (
        <Card className="p-6 border-2 border-amber-300">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">📝 Enregistrer un paiement</h3>

          {error && <div className="p-3 bg-red-100 text-red-900 text-sm rounded mb-4">{error}</div>}
          {success && <div className="p-3 bg-green-100 text-green-900 text-sm rounded mb-4">{success}</div>}

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Montant (DA)" htmlFor="amount" required>
                <input
                  id="amount"
                  type="number"
                  step="1"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={loading}
                  className={inputClass}
                  placeholder="0"
                />
              </Field>
              <Field label="Méthode" htmlFor="method" required>
                <select
                  id="method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  disabled={loading}
                  className={inputClass}
                >
                  <option value="cash">Espèces</option>
                  <option value="transfer">Virement</option>
                  <option value="card">Carte</option>
                  <option value="check">Chèque</option>
                  <option value="yalidine">Yalidine</option>
                </select>
              </Field>
            </div>

            <Button
              onClick={handleAddPayment}
              disabled={loading || !amount}
              className="w-full"
            >
              {loading ? "Enregistrement…" : "Enregistrer le paiement"}
            </Button>
          </div>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          onClick={handlePrint}
          className="flex-1"
          variant="secondary"
        >
          🖨️ Imprimer la facture
        </Button>
      </div>
    </div>
  );
}
