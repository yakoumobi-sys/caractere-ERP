"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { LOGO_PLACEMENTS, LOGO_SOURCES, TECHNIQUES, type Technique } from "@/lib/pipeline";
import { fetchYalidineWilayas } from "@/lib/actions/yalidine-actions";
import { ArticlePicker, type ArticleRow } from "./article-picker";
import type { CatalogProduct } from "@/lib/actions/catalog-actions";
import { SmartClientSelector } from "./smart-client-selector";

interface ContactOption {
  id: string;
  name: string;
}

function StepLabel({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="h-6 w-6 rounded-full bg-brand-500 text-white text-xs font-semibold flex items-center justify-center shrink-0">
        {n}
      </span>
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
    </div>
  );
}

/**
 * Configurateur de commande en 3 étapes : Client, Article, Impression.
 * Pensé pour aller vite — un commercial doit pouvoir saisir une commande
 * WhatsApp en quelques secondes.
 */
export function OrderDetailsFields({
  contacts,
  products: initialProducts,
  colors: initialColors,
  sizes: initialSizes,
  onMissingChange,
  canRecordPayments = false,
}: {
  contacts: ContactOption[];
  products: CatalogProduct[];
  colors: string[];
  sizes: string[];
  /** Le versement à la création n'est proposé qu'aux rôles autorisés à
   *  encaisser (policy order_payments_insert) — sinon il était refusé en
   *  silence après coup et l'argent encaissé n'apparaissait nulle part. */
  canRecordPayments?: boolean;
  /** Ce qu'il manque encore pour que la commande puisse partir (client,
   *  article…). Le bouton d'envoi s'appuie dessus : mieux vaut l'empêcher
   *  d'être cliqué que de faire perdre la saisie côté serveur. */
  onMissingChange?: (missing: string[]) => void;
}) {
  const [clientMode, setClientMode] = useState<"existing" | "new">("existing");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [items, setItems] = useState<ArticleRow[]>([
    { product_id: "", product_name: "", color: "", size: "", quantity: 1 },
  ]);
  // Les listes vivent ici pour qu'un ajout au catalogue depuis une ligne
  // profite immédiatement aux autres lignes de la même commande.
  const [products, setProducts] = useState(initialProducts);
  const [colors, setColors] = useState(initialColors);
  const [sizes, setSizes] = useState(initialSizes);
  const [technique, setTechnique] = useState<Technique>("dtf");
  const [logoPlacement, setLogoPlacement] = useState("coeur");
  const [logoSource, setLogoSource] = useState("whatsapp");
  const [useYalidine, setUseYalidine] = useState(false);
  const [wilayas, setWilayas] = useState<{ id: number; name: string }[]>([]);
  const [requiresFlocage, setRequiresFlocage] = useState(true); // Par défaut: flocage activé
  const [orderTotal, setOrderTotal] = useState("");
  const [initialPayment, setInitialPayment] = useState("");

  useEffect(() => {
    if (!useYalidine || wilayas.length > 0) return;
    fetchYalidineWilayas()
      .then(setWilayas)
      .catch(() => setWilayas([]));
  }, [useYalidine, wilayas.length]);

  function updateItem(i: number, patch: Partial<ArticleRow>) {
    setItems((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addOnce(list: string[], value: string) {
    return list.some((v) => v.toLowerCase() === value.toLowerCase()) ? list : [...list, value];
  }

  function addProductOnce(list: CatalogProduct[], product: CatalogProduct) {
    return list.some((p) => p.id === product.id) ? list : [...list, product];
  }

  const filledItems = items.filter((it) => it.product_name.trim());

  const totalValue = Number(orderTotal) || 0;
  const paymentValue = Number(initialPayment) || 0;
  const paymentExceedsTotal = paymentValue > 0 && totalValue > 0 && paymentValue > totalValue;

  const missing = useMemo(() => {
    const m: string[] = [];
    if (clientMode === "existing" ? !selectedContactId : !newClientName.trim()) m.push("un client");
    if (filledItems.length === 0) m.push("au moins un article");
    if (paymentExceedsTotal) m.push("un versement inférieur ou égal au total");
    return m;
  }, [clientMode, selectedContactId, newClientName, filledItems.length, paymentExceedsTotal]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onMissingChange?.(missing), [missing.join("|")]);

  return (
    // Le clavier des téléphones envoie « entrée » comme validation : sans ce
    // garde-fou, la moindre frappe dans un champ texte soumettait la commande
    // avant que les articles ne soient saisis (commandes créées vides).
    <div
      className="contents"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
          e.preventDefault();
        }
      }}
    >
      {/* 1. Client */}
      <Card className="p-6">
        <StepLabel n={1} title="Client" />
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setClientMode("existing")}
            className={`rounded-md px-3.5 py-2 text-sm font-medium border ${clientMode === "existing" ? "bg-brand-500 text-white border-brand-500" : "bg-white text-slate-600 border-slate-300"}`}
          >
            Client existant
          </button>
          <button
            type="button"
            onClick={() => setClientMode("new")}
            className={`rounded-md px-3.5 py-2 text-sm font-medium border ${clientMode === "new" ? "bg-brand-500 text-white border-brand-500" : "bg-white text-slate-600 border-slate-300"}`}
          >
            + Nouveau client
          </button>
        </div>
        <input type="hidden" name="client_mode" value={clientMode} />

        {clientMode === "existing" ? (
          <>
            <SmartClientSelector
              contacts={contacts}
              value={selectedContactId}
              onChange={setSelectedContactId}
            />
            <input type="hidden" name="contact_id" value={selectedContactId} required={clientMode === "existing"} />
          </>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Nom" htmlFor="client_new_name" required>
              <input
                id="client_new_name"
                name="client_new_name"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                required={clientMode === "new"}
                className={inputClass}
              />
            </Field>
            <Field label="Téléphone" htmlFor="client_new_phone">
              <input id="client_new_phone" name="client_new_phone" type="tel" className={inputClass} />
            </Field>
            <Field label="Type" htmlFor="client_new_type">
              <select id="client_new_type" name="client_new_type" defaultValue="client" className={inputClass}>
                <option value="client">Client</option>
                <option value="prospect">Prospect</option>
              </select>
            </Field>
          </div>
        )}

        <div className="mt-5 pt-5 border-t border-slate-200">
          <p className="text-sm font-medium text-slate-700 mb-2">Livraison</p>
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setUseYalidine(false)}
              className={`rounded-md px-3.5 py-2 text-sm font-medium border ${!useYalidine ? "bg-brand-500 text-white border-brand-500" : "bg-white text-slate-600 border-slate-300"}`}
            >
              Livraison manuelle
            </button>
            <button
              type="button"
              onClick={() => setUseYalidine(true)}
              className={`rounded-md px-3.5 py-2 text-sm font-medium border ${useYalidine ? "bg-brand-500 text-white border-brand-500" : "bg-white text-slate-600 border-slate-300"}`}
            >
              Envoyer par Yalidine
            </button>
          </div>
          <input type="hidden" name="use_yalidine" value={useYalidine ? "on" : ""} />

          {useYalidine && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Wilaya" htmlFor="yalidine_wilaya" required>
                <select id="yalidine_wilaya" name="yalidine_wilaya" required={useYalidine} className={inputClass}>
                  <option value="">{wilayas.length === 0 ? "Chargement…" : "— Sélectionner —"}</option>
                  {wilayas.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Commune" htmlFor="yalidine_commune" required>
                <input id="yalidine_commune" name="yalidine_commune" required={useYalidine} className={inputClass} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Adresse" htmlFor="yalidine_address" required>
                  <input id="yalidine_address" name="yalidine_address" required={useYalidine} className={inputClass} />
                </Field>
              </div>
              <Field label="Montant à collecter (DA)" htmlFor="yalidine_price" required>
                <input id="yalidine_price" name="yalidine_price" type="number" step="1" min="0" required={useYalidine} className={inputClass} />
              </Field>
            </div>
          )}
        </div>
      </Card>

      {/* 2. Article */}
      <Card className="p-4 sm:p-6">
        <StepLabel n={2} title="Articles" />

        <div className="flex flex-col gap-3">
          {items.map((row, i) => (
            <ArticlePicker
              key={i}
              index={i}
              value={row}
              products={products}
              colors={colors}
              sizes={sizes}
              onChange={(patch) => updateItem(i, patch)}
              onRemove={items.length > 1 ? () => setItems((prev) => prev.filter((_, idx) => idx !== i)) : undefined}
              onProductCreated={(product) => setProducts((prev) => addProductOnce(prev, product))}
              onColorCreated={(color) => setColors((prev) => addOnce(prev, color))}
              onSizeCreated={(size) => setSizes((prev) => addOnce(prev, size))}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            setItems((prev) => [...prev, { product_id: "", product_name: "", color: "", size: "", quantity: 1 }])
          }
          className="mt-3 w-full rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-600 hover:border-indigo-500 hover:text-indigo-600 dark:border-slate-600 dark:text-slate-300"
        >
          + Ajouter un article
        </button>

        {filledItems.length === 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            Choisissez au moins un article pour pouvoir créer la commande.
          </p>
        )}

        {/* Seules les lignes réellement remplies partent au serveur. */}
        <input type="hidden" name="items_json" value={JSON.stringify(filledItems)} />
      </Card>

      {/* 3. Impression */}
      <Card className="p-6">
        <StepLabel n={3} title="Impression" />
        <div className="grid grid-cols-3 gap-2 mb-4">
          {TECHNIQUES.map((t) => (
            <label
              key={t.value}
              className={`flex items-center justify-center text-center rounded-md border px-3 py-3 text-sm font-medium cursor-pointer ${
                technique === t.value ? "bg-brand-500 text-white border-brand-500" : "bg-white text-slate-600 border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="technique"
                value={t.value}
                checked={technique === t.value}
                onChange={() => setTechnique(t.value)}
                className="sr-only"
              />
              {t.label}
            </label>
          ))}
        </div>

        {technique === "dtf" && (
          <label className="flex items-center gap-2 mb-4 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              name="skip_flocage"
              checked={!requiresFlocage}
              onChange={(e) => setRequiresFlocage(!e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span>
              Pas de flocage après impression
              <br />
              <span className="text-xs text-slate-500">(Par défaut: envoyé en flocage)</span>
            </span>
          </label>
        )}
        {technique === "dtf" && (
          <input type="hidden" name="requires_flocage" value={requiresFlocage ? "on" : ""} />
        )}

        {technique !== "aucune" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Emplacement du logo" htmlFor="logo_placement" required>
              <select
                id="logo_placement"
                name="logo_placement"
                value={logoPlacement}
                onChange={(e) => setLogoPlacement(e.target.value)}
                required
                className={inputClass}
              >
                {LOGO_PLACEMENTS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            {logoPlacement === "special" && (
              <Field label="Précisions" htmlFor="logo_placement_note">
                <input id="logo_placement_note" name="logo_placement_note" className={inputClass} />
              </Field>
            )}

            <Field label="Où récupérer le logo" htmlFor="logo_source" required>
              <select
                id="logo_source"
                name="logo_source"
                value={logoSource}
                onChange={(e) => setLogoSource(e.target.value)}
                required
                className={inputClass}
              >
                {LOGO_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={logoSource === "email" ? "Adresse email du client" : "Numéro du client"} htmlFor="logo_source_value">
              <input id="logo_source_value" name="logo_source_value" className={inputClass} />
            </Field>

            <div className="sm:col-span-2">
              <Field label="Ou envoyer directement le fichier (optionnel)" htmlFor="logo">
                <input id="logo" name="logo" type="file" accept="image/*,.pdf,.ai,.eps" className={inputClass} />
              </Field>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Vêtements bruts, sans personnalisation — la commande part directement en préparation.</p>
        )}
      </Card>

      {/* 4. Prix & paiement — jusqu'ici aucun écran ne permettait de saisir
          le montant : page Ventes et tableau de bord restaient à 0 DA. */}
      <Card className="p-6">
        <StepLabel n={4} title="Prix & paiement" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Montant total de la commande (DA)" htmlFor="order_total">
            <input
              id="order_total"
              name="order_total"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={orderTotal}
              onChange={(e) => setOrderTotal(e.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </Field>
          {canRecordPayments && (
            <Field label="Versement encaissé maintenant (DA)" htmlFor="initial_payment">
              <input
                id="initial_payment"
                name="initial_payment"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={initialPayment}
                onChange={(e) => setInitialPayment(e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            </Field>
          )}
        </div>
        {paymentExceedsTotal && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">Le versement dépasse le montant total.</p>
        )}
        {!canRecordPayments && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Le versement se saisit ensuite sur la fiche commande par l&apos;administration ou le commercial.
          </p>
        )}
        {totalValue > 0 && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Reste à payer à la livraison : {Math.max(0, totalValue - paymentValue).toLocaleString("fr-DZ")} DA
          </p>
        )}
      </Card>
    </div>
  );
}
