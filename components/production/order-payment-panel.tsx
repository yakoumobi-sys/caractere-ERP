"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordOrderPayment, setOrderTotal } from "@/lib/actions/payment-actions";
import { Card, Button, Field, inputClass, Badge } from "@/components/ui";

interface Payment {
  id: string;
  amount: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Espèces",
  transfer: "Virement",
  card: "Carte",
  check: "Chèque",
  yalidine: "Yalidine",
  other: "Autre",
};

function formatDA(n: number) {
  return `${Math.round(n).toLocaleString("fr-DZ")} DA`;
}

/**
 * Montant, versements et reste à payer d'une commande.
 *
 * Le module paiements (migration 0030) existait en base mais n'était branché
 * nulle part : aucun écran ne permettait de saisir le montant d'une commande,
 * et ce panneau n'était affiché sur aucune page. Résultat : 42 commandes sur
 * 43 sans montant, zéro paiement enregistré, page Ventes et tableau de bord
 * à 0 DA.
 *
 * « Versé » est la somme des paiements DE CETTE commande — l'ancienne version
 * le déduisait du solde global du client, faux dès qu'il a deux commandes.
 */
export function OrderPaymentPanel({
  orderId,
  orderTotal,
  payments,
  canRecord,
}: {
  orderId: string;
  orderTotal: number | null;
  payments: Payment[];
  /** Rôle autorisé à encaisser (admin / manager / ventes). */
  canRecord: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingTotal, setEditingTotal] = useState(orderTotal === null);
  const [totalDraft, setTotalDraft] = useState(orderTotal?.toString() ?? "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [error, setError] = useState<string | null>(null);

  const paid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const remaining = orderTotal !== null ? orderTotal - paid : null;
  const fullyPaid = remaining !== null && orderTotal !== null && orderTotal > 0 && remaining <= 0;

  function saveTotal() {
    const value = totalDraft.trim() === "" ? null : Number(totalDraft);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setError("Le montant doit être un nombre positif.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await setOrderTotal(orderId, value);
        setEditingTotal(false);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function addPayment() {
    const value = Number(amount);
    if (!amount || !Number.isFinite(value) || value <= 0) {
      setError("Entrez un montant positif.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await recordOrderPayment(orderId, value, method);
        setAmount("");
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <Card className="p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Montant & paiement</h2>
        {orderTotal === null ? (
          <Badge tone="amber">Montant non renseigné</Badge>
        ) : fullyPaid ? (
          <Badge tone="green">Payée</Badge>
        ) : paid > 0 ? (
          <Badge tone="amber">Partiellement payée</Badge>
        ) : (
          <Badge tone="red">Non payée</Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Total</p>
          {editingTotal ? (
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={totalDraft}
                onChange={(e) => setTotalDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveTotal();
                  }
                }}
                placeholder="0"
                disabled={pending}
                className={`${inputClass} w-32`}
                autoFocus={orderTotal !== null}
              />
              <Button type="button" onClick={saveTotal} disabled={pending} className="px-3">
                OK
              </Button>
            </div>
          ) : (
            <p className="text-2xl font-bold text-slate-900 dark:text-white flex items-baseline gap-2">
              {formatDA(orderTotal ?? 0)}
              <button
                type="button"
                onClick={() => setEditingTotal(true)}
                className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Modifier
              </button>
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Versé</p>
          <p className="text-2xl font-bold text-emerald-600">{formatDA(paid)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Reste à payer</p>
          <p className={`text-2xl font-bold ${fullyPaid ? "text-emerald-600" : "text-red-600"}`}>
            {remaining === null ? "—" : formatDA(Math.max(0, remaining))}
          </p>
        </div>
      </div>

      {payments.length > 0 && (
        <table className="w-full text-sm mb-4">
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="py-1.5 text-slate-500 dark:text-slate-400 text-xs">
                  {new Date(p.created_at).toLocaleDateString("fr-FR")}
                </td>
                <td className="py-1.5 text-slate-700 dark:text-slate-300">
                  {METHOD_LABELS[p.payment_method] ?? p.payment_method}
                  {p.notes ? <span className="text-slate-400"> — {p.notes}</span> : null}
                </td>
                <td className="py-1.5 text-right font-medium text-slate-900 dark:text-white">{formatDA(Number(p.amount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {canRecord ? (
        !fullyPaid && (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Encaisser (DA)" htmlFor="payment_amount">
              <input
                id="payment_amount"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={pending}
                placeholder={remaining !== null && remaining > 0 ? String(Math.round(remaining)) : "0"}
                className={`${inputClass} w-32`}
              />
            </Field>
            <Field label="Méthode" htmlFor="payment_method">
              <select
                id="payment_method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                disabled={pending}
                className={`${inputClass} w-36`}
              >
                {Object.entries(METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Button type="button" onClick={addPayment} disabled={pending || !amount} variant="secondary">
              {pending ? "…" : "Enregistrer le paiement"}
            </Button>
          </div>
        )
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Les paiements sont enregistrés par l&apos;administration ou le commercial.
        </p>
      )}
    </Card>
  );
}
