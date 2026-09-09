"use client";

import { useEffect, useRef, useState } from "react";
// React 18 / Next 14 : l'équivalent de useActionState s'appelle encore
// useFormState et vit dans react-dom.
import { useFormState, useFormStatus } from "react-dom";
import {
  addStockMove,
  transferStock,
  setReorderPoint,
  emptyStockFormState,
  type StockFormState,
} from "@/lib/actions/inventory-actions";
import { Button, Field, inputClass } from "@/components/ui";
import { formatQuantity, type StockRow, type WarehouseLevel, type WarehouseOption } from "./stock-types";

type Mode = "entree" | "sortie" | "ajustement" | "transfert" | "seuil";

const MODE_LABEL: Record<Mode, string> = {
  entree: "Entrée",
  sortie: "Sortie",
  ajustement: "Ajustement",
  transfert: "Transfert",
  seuil: "Seuil d'alerte",
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Enregistrement…" : label}
    </Button>
  );
}

/**
 * Saisie d'un mouvement pour un article donné.
 *
 * Le formulaire est monté avec une `key` portant l'article et le mode : React
 * remonte alors le composant, ce qui remet à zéro l'état du `useFormState`.
 * Sans cela, le message « Entrée de 10 enregistrée » restait affiché en passant
 * à l'article suivant et laissait croire qu'un mouvement venait d'être saisi.
 */
export function StockMovePanel({
  product,
  levels,
  warehouses,
  onDone,
  onClose,
}: {
  product: StockRow;
  levels: WarehouseLevel[];
  warehouses: WarehouseOption[];
  onDone: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("entree");

  return (
    <div className="border-t-2 border-indigo-200 bg-indigo-50/60 px-4 py-4 dark:border-indigo-700 dark:bg-indigo-950/30">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {product.name}
            <span className="ml-2 font-mono text-xs font-normal text-slate-500 dark:text-slate-400">{product.sku}</span>
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            En stock : {formatQuantity(product.quantity)} {product.unit ?? ""}
            {levels.length > 0 && (
              <>
                {" · "}
                {levels.map((l) => `${l.warehouse_name} : ${formatQuantity(l.quantity)}`).join(" · ")}
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Fermer
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Type de mouvement">
        {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={
              mode === m
                ? "rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow"
                : "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            }
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      {mode === "transfert" && (
        <TransferForm
          key={`transfert-${product.product_id}`}
          product={product}
          warehouses={warehouses}
          onDone={onDone}
        />
      )}
      {mode === "seuil" && <ReorderForm key={`seuil-${product.product_id}`} product={product} onDone={onDone} />}
      {mode !== "transfert" && mode !== "seuil" && (
        <MoveForm
          key={`${mode}-${product.product_id}`}
          product={product}
          mode={mode}
          warehouses={warehouses}
          onDone={onDone}
        />
      )}
    </div>
  );
}

function Feedback({ state }: { state: StockFormState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200"
      >
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p
        role="status"
        className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
      >
        {state.success}
      </p>
    );
  }
  return null;
}

/**
 * Le formulaire est vidé après un enregistrement réussi, et seulement dans ce
 * cas : après un refus, la quantité saisie reste à l'écran à corriger.
 */
function useResetOnSuccess(state: StockFormState, onDone: () => void) {
  const formRef = useRef<HTMLFormElement>(null);
  const lastHandled = useRef<string | null>(null);

  useEffect(() => {
    if (state.success && state.success !== lastHandled.current) {
      lastHandled.current = state.success;
      formRef.current?.reset();
      onDone();
    }
  }, [state.success, onDone]);

  return formRef;
}

function MoveForm({
  product,
  mode,
  warehouses,
  onDone,
}: {
  product: StockRow;
  mode: Exclude<Mode, "transfert" | "seuil">;
  warehouses: WarehouseOption[];
  onDone: () => void;
}) {
  const [state, formAction] = useFormState(addStockMove, emptyStockFormState);
  const formRef = useResetOnSuccess(state, onDone);
  const defaultWarehouse = warehouses.find((w) => w.is_default) ?? warehouses[0];

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="product_id" value={product.product_id} />
      <input type="hidden" name="type" value={mode} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field label="Entrepôt" htmlFor={`wh-${product.product_id}`} required>
          <select
            id={`wh-${product.product_id}`}
            name="warehouse_id"
            required
            defaultValue={defaultWarehouse?.id ?? ""}
            className={inputClass}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={mode === "ajustement" ? "Écart (+/−)" : "Quantité"} htmlFor={`qty-${product.product_id}`} required>
          <input
            id={`qty-${product.product_id}`}
            name="quantity"
            type="number"
            step="0.01"
            required
            autoFocus
            placeholder={mode === "ajustement" ? "ex : -3" : "0"}
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Motif (optionnel)" htmlFor={`note-${product.product_id}`}>
            <input
              id={`note-${product.product_id}`}
              name="note"
              type="text"
              placeholder={
                mode === "entree"
                  ? "Réception fournisseur, retour client…"
                  : mode === "sortie"
                    ? "Casse, échantillon, perte…"
                    : "Inventaire physique du 12/03…"
              }
              className={inputClass}
            />
          </Field>
        </div>
      </div>
      <Feedback state={state} />
      <div className="flex items-center gap-3">
        <SubmitButton label={`Enregistrer l'${MODE_LABEL[mode].toLowerCase()}`} />
        {mode === "ajustement" && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Saisissez l&apos;écart constaté, pas la quantité totale : −3 retire 3 unités.
          </p>
        )}
      </div>
    </form>
  );
}

function TransferForm({
  product,
  warehouses,
  onDone,
}: {
  product: StockRow;
  warehouses: WarehouseOption[];
  onDone: () => void;
}) {
  const [state, formAction] = useFormState(transferStock, emptyStockFormState);
  const formRef = useResetOnSuccess(state, onDone);

  if (warehouses.length < 2) {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Un transfert demande au moins deux entrepôts. Créez-en un second depuis Stock → Entrepôts.
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="product_id" value={product.product_id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field label="Depuis" htmlFor={`from-${product.product_id}`} required>
          <select
            id={`from-${product.product_id}`}
            name="from_warehouse_id"
            required
            defaultValue={warehouses[0].id}
            className={inputClass}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vers" htmlFor={`to-${product.product_id}`} required>
          <select
            id={`to-${product.product_id}`}
            name="to_warehouse_id"
            required
            defaultValue={warehouses[1].id}
            className={inputClass}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quantité" htmlFor={`tqty-${product.product_id}`} required>
          <input
            id={`tqty-${product.product_id}`}
            name="quantity"
            type="number"
            step="0.01"
            min="0"
            required
            className={inputClass}
          />
        </Field>
        <Field label="Motif (optionnel)" htmlFor={`tnote-${product.product_id}`}>
          <input id={`tnote-${product.product_id}`} name="note" type="text" className={inputClass} />
        </Field>
      </div>
      <Feedback state={state} />
      <SubmitButton label="Transférer" />
    </form>
  );
}

/**
 * Le seuil se règle ici plutôt que dans la fiche produit : on décide de la
 * valeur en regardant la quantité restante et la consommation récente, qui
 * sont sous les yeux.
 */
function ReorderForm({ product, onDone }: { product: StockRow; onDone: () => void }) {
  const [state, formAction] = useFormState(setReorderPoint, emptyStockFormState);
  const formRef = useResetOnSuccess(state, onDone);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="product_id" value={product.product_id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field label="Alerter en dessous de" htmlFor={`seuil-${product.product_id}`} required>
          <input
            id={`seuil-${product.product_id}`}
            name="reorder_point"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={product.reorder_point}
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-3 flex items-end">
          <p className="pb-2 text-xs text-slate-500 dark:text-slate-400">
            L&apos;article passe en « sous le seuil » dès que la quantité descend à cette valeur ou en dessous. À 0,
            seule la rupture est signalée.
          </p>
        </div>
      </div>
      <Feedback state={state} />
      <SubmitButton label="Enregistrer le seuil" />
    </form>
  );
}
