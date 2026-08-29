"use client";

import { useState, useEffect } from "react";
import { calculateFinalPrice } from "@/lib/actions/pricing-actions";
import { Card, Field, inputClass, Badge } from "@/components/ui";

interface DTFPricingCalculatorProps {
  productId: string;
  productName: string;
  basePrice: number;
  onPriceChange?: (price: number, dtfCost: number) => void;
}

/**
 * Composant pour calculer le prix final avec DTF
 * Formule: Prix final = Prix de vente + (Longueur DTF / 100) × 700 DA
 */
export function DTFPricingCalculator({
  productId,
  productName,
  basePrice,
  onPriceChange,
}: DTFPricingCalculatorProps) {
  const [dtfLength, setDtfLength] = useState("");
  const [dtfCost, setDtfCost] = useState(0);
  const [finalPrice, setFinalPrice] = useState(basePrice);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Calculer le prix automatiquement quand la longueur DTF change
  useEffect(() => {
    const calculatePrice = async () => {
      if (!dtfLength || Number(dtfLength) <= 0) {
        setDtfCost(0);
        setFinalPrice(basePrice);
        onPriceChange?.(basePrice, 0);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const length = Number(dtfLength);
        const result = await calculateFinalPrice(productId, length);
        setDtfCost(result.dtfCost);
        setFinalPrice(result.finalPrice);
        onPriceChange?.(result.finalPrice, result.dtfCost);
      } catch (err) {
        setError("Erreur lors du calcul: " + (err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(calculatePrice, 500); // Délai pour éviter trop d'appels
    return () => clearTimeout(timer);
  }, [dtfLength, productId, basePrice, onPriceChange]);

  return (
    <div className="space-y-4">
      <Card className="p-6 border-2 border-blue-300 bg-blue-50">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">
          💠 Calcul DTF - {productName}
        </h3>

        {/* Tarif base */}
        <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-white rounded border">
          <div>
            <p className="text-xs text-slate-600">Prix de vente</p>
            <p className="text-xl font-bold text-slate-900">
              {basePrice.toLocaleString()} DA
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-600">Coût DTF (cm)</p>
            <p className="text-xl font-bold text-amber-600">
              {dtfCost > 0 ? `+${dtfCost.toLocaleString()} DA` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-600">Prix Final</p>
            <p className="text-2xl font-bold text-green-600">
              {finalPrice.toLocaleString()} DA
            </p>
          </div>
        </div>

        {/* Saisie longueur DTF */}
        <Field label="Longueur DTF (cm)" htmlFor="dtf-length" required>
          <div className="flex gap-2">
            <input
              id="dtf-length"
              type="number"
              step="1"
              min="0"
              max="200"
              value={dtfLength}
              onChange={(e) => setDtfLength(e.target.value)}
              disabled={loading}
              placeholder="Ex: 20"
              className={inputClass}
            />
            <div className="flex items-center px-3 bg-slate-100 rounded text-sm font-mono text-slate-600">
              cm
            </div>
          </div>
        </Field>

        {/* Formule */}
        <div className="mt-4 p-3 bg-slate-100 rounded text-xs text-slate-700 font-mono">
          Formule: ({dtfLength || "L"} cm ÷ 100) × 700 DA/m = {dtfCost > 0 ? `${dtfCost} DA` : "0 DA"}
        </div>

        {/* Détail du calcul */}
        {dtfLength && Number(dtfLength) > 0 && (
          <div className="mt-4 p-3 bg-green-50 border border-green-300 rounded">
            <p className="text-sm text-green-900">
              <strong>Détail:</strong> ({Number(dtfLength)} ÷ 100) × 700 = <strong>{dtfCost} DA</strong>
            </p>
            <p className="text-sm text-green-900 mt-1">
              <strong>Total:</strong> {basePrice.toLocaleString()} + {dtfCost.toLocaleString()} = <strong className="text-lg">{finalPrice.toLocaleString()} DA</strong>
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-100 text-red-900 text-sm rounded">
            {error}
          </div>
        )}

        {/* Exemples */}
        <div className="mt-4 p-3 bg-slate-50 rounded text-xs text-slate-700">
          <p className="font-semibold mb-2">📋 Exemples:</p>
          <ul className="space-y-1 font-mono">
            <li>• 10 cm DTF → ({10} ÷ 100) × 700 = 70 DA</li>
            <li>• 20 cm DTF → ({20} ÷ 100) × 700 = 140 DA</li>
            <li>• 50 cm DTF → ({50} ÷ 100) × 700 = 350 DA</li>
            <li>• 100 cm DTF → ({100} ÷ 100) × 700 = 700 DA</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
