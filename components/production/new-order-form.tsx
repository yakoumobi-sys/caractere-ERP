"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createPipelineOrder, type OrderFormState } from "@/lib/actions/pipeline-actions";
import { OrderDetailsFields } from "@/components/production/order-details-fields";
import { Button, Card, Field, inputClass } from "@/components/ui";

interface ContactOption {
  id: string;
  name: string;
}

const initialState: OrderFormState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto text-base px-6 py-3">
      {pending ? "Création en cours…" : "Créer la commande"}
    </Button>
  );
}

/**
 * Formulaire de création de commande. L'action renvoie son erreur au lieu de la
 * lever : le message exact de la base s'affiche ici, sous le bouton, plutôt que
 * dans la page d'erreur générique de Next (qui masque le message en production).
 */
export function NewOrderForm({ contacts }: { contacts: ContactOption[] }) {
  const [state, formAction] = useFormState(createPipelineOrder, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <OrderDetailsFields contacts={contacts} />

      <Card className="p-6">
        <Field label="Note (optionnel)" htmlFor="description">
          <textarea id="description" name="description" rows={2} className={inputClass} />
        </Field>
      </Card>

      {state.error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-800">La commande n&apos;a pas pu être créée</p>
          <p className="mt-1 text-sm text-red-700 break-words">{state.error}</p>
        </div>
      )}

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
