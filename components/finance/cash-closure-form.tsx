"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeCashDay } from "@/lib/actions/operations-actions";
import { Button, Field, inputClass } from "@/components/ui";

export function CashClosureForm({ today }: { today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        if (
          !window.confirm(
            "Clôturer cette journée ? Les espèces de cette journée et des dates précédentes ne pourront plus être modifiées.",
          )
        )
          return;
        setError(null);
        setSuccess(false);
        startTransition(async () => {
          try {
            await closeCashDay(data);
            setSuccess(true);
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Clôture impossible.");
          }
        });
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Journée à clôturer" htmlFor="closing_date">
          <input
            id="closing_date"
            name="closing_date"
            type="date"
            required
            max={today}
            defaultValue={today}
            className={inputClass}
          />
        </Field>
        <Field
          label="Espèces comptées physiquement (DA)"
          htmlFor="counted_amount"
        >
          <input
            id="counted_amount"
            name="counted_amount"
            type="number"
            required
            min="0"
            step="0.01"
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Commentaire / explication d’écart" htmlFor="closure_note">
        <textarea
          id="closure_note"
          name="note"
          maxLength={2000}
          className={inputClass}
        />
      </Field>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-green-700">
          Journée clôturée. Le comptage a été conservé.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Clôture…" : "Clôturer la caisse"}
      </Button>
    </form>
  );
}
