"use client";

import { reportAbsence } from "@/lib/actions/employee-actions";
import { Card, Button, Field, inputClass } from "@/components/ui";

export function AbsenceReporter() {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await reportAbsence(formData);
      alert("✅ Absence signalée");
      (e.target as HTMLFormElement).reset();
    } catch (error) {
      alert("❌ Erreur: " + (error as Error).message);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Signaler une absence</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Date" htmlFor="date" required>
          <input id="date" name="date" type="date" required className={inputClass} />
        </Field>
        <Field label="Raison" htmlFor="reason" required>
          <select id="reason" name="reason" required className={inputClass}>
            <option value="">-- Sélectionne --</option>
            <option value="maladie">Maladie</option>
            <option value="conges">Congés</option>
            <option value="rendez-vous">Rendez-vous médical</option>
            <option value="autre">Autre</option>
          </select>
        </Field>
        <Field label="Notes (optionnel)" htmlFor="notes">
          <textarea id="notes" name="notes" rows={2} className={inputClass} />
        </Field>
        <Button type="submit">Signaler</Button>
      </form>
    </Card>
  );
}
