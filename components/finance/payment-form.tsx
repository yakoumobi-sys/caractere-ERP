"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPayment } from "@/lib/actions/document-actions";
import { Button, Field, inputClass } from "@/components/ui";
import { invoiceMethods, methodLabels } from "@/lib/finance";
export function PaymentForm({
  invoiceId,
  balance,
  today,
}: {
  invoiceId: string;
  balance: number;
  today: string;
}) {
  const token = useRef<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const data = new FormData(e.currentTarget);
        token.current ??= crypto.randomUUID();
        data.set("request_id", token.current);
        setError("");
        startTransition(async () => {
          try {
            await addPayment(invoiceId, data);
            token.current = null;
            router.refresh();
          } catch {
            setError(
              "Paiement non confirmé. Vérifiez le montant, la date et vos droits avant de réessayer.",
            );
          }
        });
      }}
      className="space-y-4"
    >
      {error && (
        <p role="alert" className="text-red-600 text-sm">
          {error}
        </p>
      )}
      <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
        <Field label="Montant (DA)" htmlFor="payment-amount">
          <input
            id="payment-amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            max={balance}
            defaultValue={balance}
            required
            className={inputClass}
          />
        </Field>
        <Field label="Mode de règlement" htmlFor="payment-method">
          <select
            id="payment-method"
            name="method"
            defaultValue="especes"
            className={inputClass}
          >
            {invoiceMethods.map((m) => (
              <option key={m} value={m}>
                {methodLabels[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date d’encaissement" htmlFor="payment-date">
          <input
            id="payment-date"
            name="paid_at"
            type="date"
            max={today}
            defaultValue={today}
            required
            className={inputClass}
          />
        </Field>
        <Field label="Référence / note" htmlFor="payment-note">
          <input
            id="payment-note"
            name="note"
            maxLength={1000}
            className={inputClass}
          />
        </Field>
      </fieldset>
      <Button type="submit" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer le règlement"}
      </Button>
    </form>
  );
}
