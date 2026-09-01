"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createCatalogColor,
  createCatalogProduct,
  createCatalogSize,
  type CatalogProduct,
} from "@/lib/actions/catalog-actions";
import { inputClass } from "@/components/ui";
import { cx } from "@/lib/utils";

export interface ArticleRow {
  /** Lien vers la fiche catalogue ; le nom reste stocké à part pour garder
   *  trace de ce qui a été vendu si la fiche change plus tard. */
  product_id: string;
  product_name: string;
  color: string;
  size: string;
  quantity: number;
}

/** Pastille tactile : cible large, état sélectionné très lisible sur mobile. */
function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-full border px-3.5 py-2 text-sm font-medium transition-all active:scale-95",
        active
          ? "border-indigo-600 bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
          : "border-slate-300 bg-white text-slate-700 hover:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
      )}
    >
      {children}
    </button>
  );
}

/**
 * Liste de valeurs courtes (couleurs, tailles) en pastilles, avec ajout au
 * catalogue à la demande. Les listes tiennent en une poignée d'entrées : des
 * pastilles se tapent plus vite qu'un menu déroulant sur téléphone.
 */
function ChipGroup({
  label,
  options,
  selected,
  placeholder,
  onSelect,
  onCreate,
}: {
  label: string;
  options: string[];
  selected: string;
  placeholder: string;
  onSelect: (value: string) => void;
  onCreate: (value: string) => Promise<string | null>;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const value = draft.trim();
    if (!value) return;
    setError(null);
    startTransition(async () => {
      const err = await onCreate(value);
      if (err) {
        setError(err);
        return;
      }
      onSelect(value);
      setDraft("");
      setAdding(false);
    });
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Chip key={option} active={selected === option} onClick={() => onSelect(selected === option ? "" : option)}>
            {option}
          </Chip>
        ))}
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed border-slate-400 px-3.5 py-2 text-sm font-medium text-slate-600 hover:border-indigo-500 hover:text-indigo-600 dark:border-slate-600 dark:text-slate-300"
          >
            + Autre
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-2">
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
                if (e.key === "Escape") {
                  setAdding(false);
                  setDraft("");
                  setError(null);
                }
              }}
              placeholder={placeholder}
              autoFocus
              className={inputClass}
            />
            <button
              type="button"
              onClick={submit}
              disabled={pending || !draft.trim()}
              className="shrink-0 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? "…" : "Ajouter"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setDraft("");
                setError(null);
              }}
              className="shrink-0 rounded-lg px-2 text-sm text-slate-500"
            >
              Annuler
            </button>
          </div>
          {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

/** Recherche dans le stock ; la création d'un article reste un geste explicite. */
function ProductField({
  products,
  value,
  onSelect,
  onCreated,
}: {
  products: CatalogProduct[];
  value: string;
  onSelect: (product: CatalogProduct) => void;
  onCreated: (product: CatalogProduct) => void;
}) {
  const [open, setOpen] = useState(!value);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const needle = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!needle) return products.slice(0, 6);
    return products.filter((p) => p.name.toLowerCase().includes(needle)).slice(0, 6);
  }, [products, needle]);

  const alreadyExists = products.some((p) => p.name.toLowerCase() === needle);

  function create() {
    const name = query.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const result = await createCatalogProduct(name);
      if (result.error || !result.product) {
        setError(result.error ?? "Création impossible.");
        return;
      }
      onCreated(result.product);
      onSelect(result.product);
      setQuery("");
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 dark:border-slate-600 dark:bg-slate-800/60">
        <span className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-white">{value}</span>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setQuery("");
          }}
          className="shrink-0 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Changer
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Sur mobile la touche « entrée » du clavier soumet le formulaire :
          // on la neutralise et on s'en sert pour valider le premier résultat.
          if (e.key === "Enter") {
            e.preventDefault();
            if (results.length > 0) {
              onSelect(results[0]);
              setOpen(false);
            } else if (needle && !alreadyExists) {
              create();
            }
          }
        }}
        placeholder="Rechercher dans le stock…"
        autoComplete="off"
        className={inputClass}
      />

      <div className="mt-2 flex flex-col gap-1">
        {results.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() => {
              onSelect(product);
              setOpen(false);
            }}
            className="rounded-lg px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-indigo-50 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            {product.name}
          </button>
        ))}

        {results.length === 0 && !needle && (
          <p className="px-1 py-2 text-xs text-slate-500 dark:text-slate-400">Aucun article au catalogue.</p>
        )}

        {needle && !alreadyExists && (
          <button
            type="button"
            onClick={create}
            disabled={pending}
            className="rounded-lg border border-dashed border-indigo-400 px-3 py-2.5 text-left text-sm font-medium text-indigo-600 disabled:opacity-50 dark:text-indigo-400"
          >
            {pending ? "Création…" : `+ Créer « ${query.trim()} » dans le stock`}
          </button>
        )}
      </div>

      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export function ArticlePicker({
  index,
  value,
  products,
  colors,
  sizes,
  onChange,
  onRemove,
  onProductCreated,
  onColorCreated,
  onSizeCreated,
}: {
  index: number;
  value: ArticleRow;
  products: CatalogProduct[];
  colors: string[];
  sizes: string[];
  onChange: (patch: Partial<ArticleRow>) => void;
  onRemove?: () => void;
  onProductCreated: (product: CatalogProduct) => void;
  onColorCreated: (color: string) => void;
  onSizeCreated: (size: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
          {index + 1}
        </span>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-xs font-medium text-red-600 hover:underline dark:text-red-400">
            Retirer
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <ProductField
          products={products}
          value={value.product_name}
          onSelect={(product) => onChange({ product_id: product.id, product_name: product.name })}
          onCreated={onProductCreated}
        />

        <ChipGroup
          label="Couleur"
          options={colors}
          selected={value.color}
          placeholder="Ex. Bordeaux"
          onSelect={(color) => onChange({ color })}
          onCreate={async (color) => {
            const result = await createCatalogColor(color);
            if (result.error || !result.value) return result.error ?? "Ajout impossible.";
            onColorCreated(result.value);
            return null;
          }}
        />

        <ChipGroup
          label="Taille"
          options={sizes}
          selected={value.size}
          placeholder="Ex. 3XL"
          onSelect={(size) => onChange({ size })}
          onCreate={async (size) => {
            const result = await createCatalogSize(size);
            if (result.error || !result.value) return result.error ?? "Ajout impossible.";
            onSizeCreated(result.value);
            return null;
          }}
        />

        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Quantité</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onChange({ quantity: Math.max(1, (Number(value.quantity) || 1) - 1) })}
              className="h-10 w-10 rounded-full border border-slate-300 text-lg font-bold text-slate-700 active:scale-95 dark:border-slate-600 dark:text-slate-200"
              aria-label="Diminuer la quantité"
            >
              −
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={value.quantity}
              onChange={(e) => onChange({ quantity: Math.max(1, Number(e.target.value) || 1) })}
              className="w-16 rounded-lg border border-slate-300 bg-white py-2 text-center text-base font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
            <button
              type="button"
              onClick={() => onChange({ quantity: (Number(value.quantity) || 1) + 1 })}
              className="h-10 w-10 rounded-full border border-slate-300 text-lg font-bold text-slate-700 active:scale-95 dark:border-slate-600 dark:text-slate-200"
              aria-label="Augmenter la quantité"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
