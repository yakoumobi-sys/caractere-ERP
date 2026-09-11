"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordCashMovement } from "@/lib/actions/cash-actions";
import { Button, Field, inputClass } from "@/components/ui";
export function CashMovementForm({
  accounts,
  today,
}: {
  accounts: { id: string; code: string; name: string; type: string }[];
  today: string;
}) {
  const [direction, setDirection] = useState("out");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const token = useRef<string | null>(null);
  const router = useRouter();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const form = e.currentTarget,
          data = new FormData(form);
        token.current ??= crypto.randomUUID();
        data.set("request_id", token.current);
        setMessage("");
        startTransition(async () => {
          try {
            await recordCashMovement(data);
            token.current = null;
            form.reset();
            setDirection("out");
            setMessage("Mouvement enregistré.");
            router.refresh();
          } catch {
            setMessage(
              "Mouvement non confirmé. Vérifiez le compte, le montant et la date avant de réessayer.",
            );
          }
        });
      }}
    >
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
        <Field label="Mouvement" htmlFor="cash-direction">
          <select
            id="cash-direction"
            name="direction"
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            className={inputClass}
          >
            <option value="out">Sortie de caisse</option>
            <option value="in">Retrait bancaire vers la caisse</option>
          </select>
        </Field>
        <Field label="Montant (DA)" htmlFor="cash-amount">
          <input
            id="cash-amount"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            className={inputClass}
          />
        </Field>
        <Field label="Compte de contrepartie" htmlFor="cash-account">
          <select
            key={direction}
            id="cash-account"
            name="account_id"
            required
            className={inputClass}
            defaultValue=""
          >
            <option value="">Choisir une charge ou la banque</option>
            {accounts
              .filter(
                (a) =>
                  a.code === "512" ||
                  (direction === "out" && a.type === "charge"),
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Date" htmlFor="cash-date">
          <input
            id="cash-date"
            name="date"
            type="date"
            required
            defaultValue={today}
            max={today}
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Motif / référence du justificatif" htmlFor="cash-label">
            <input
              id="cash-label"
              name="label"
              minLength={3}
              maxLength={1000}
              required
              className={inputClass}
              placeholder="Ex. achat de fournitures — ticket 125"
            />
          </Field>
        </div>
      </fieldset>
      <Button type="submit" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer le mouvement"}
      </Button>
    </form>
  );
}
