"use client";

import { useState } from "react";
// React 18 / Next 14 : l'équivalent de useActionState s'appelle encore
// useFormState et vit dans react-dom.
import { useFormState, useFormStatus } from "react-dom";
import { createPipelineOrder, type OrderFormState } from "@/lib/actions/pipeline-actions";
import { OrderDetailsFields } from "@/components/production/order-details-fields";
import { Button, Card, Field, inputClass } from "@/components/ui";
import type { CatalogProduct } from "@/lib/actions/catalog-actions";

const initialState: OrderFormState = { error: null };

/**
 * Formulaire de création de commande.
 *
 * Deux garde-fous, tirés des échecs constatés en production ("Le client est
 * requis", "Ajoutez au moins un article") : le bouton reste inactif tant qu'il
 * manque quelque chose, et un refus du serveur s'affiche EN HAUT du formulaire
 * sans effacer la saisie — auparavant l'écran d'erreur de Next.js remplaçait la
 * page et tout était à retaper.
 */
export function NewOrderForm({
  contacts,
  products,
  colors,
  sizes,
}: {
  contacts: { id: string; name: string }[];
  products: CatalogProduct[];
  colors: string[];
  sizes: string[];
}) {
  const [state, formAction] = useFormState(createPipelineOrder, initialState);
  const [missing, setMissing] = useState<string[]>([]);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200"
        >
          {state.error}
        </div>
      )}

      <OrderDetailsFields
        contacts={contacts}
        products={products}
        colors={colors}
        sizes={sizes}
        onMissingChange={setMissing}
      />

      <Card className="p-6">
        <Field label="Note (optionnel)" htmlFor="description">
          <textarea id="description" name="description" rows={2} className={inputClass} />
        </Field>
      </Card>

      <SubmitButton missing={missing} />
    </form>
  );
}

/** Bouton d'envoi : inactif tant qu'il manque quelque chose, et pendant l'envoi
 *  (un double appui créait deux fois la même commande). */
function SubmitButton({ missing }: { missing: string[] }) {
  const { pending } = useFormStatus();

  return (
    <div>
      <Button
        type="submit"
        disabled={pending || missing.length > 0}
        className="w-full sm:w-auto text-base px-6 py-3"
      >
        {pending ? "Création…" : "Créer la commande"}
      </Button>
      {missing.length > 0 && (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
          Il manque encore {missing.join(" et ")} pour créer la commande.
        </p>
      )}
    </div>
  );
}
