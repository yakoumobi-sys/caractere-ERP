"use client";

import { useState } from "react";
import { Button, Card, Field, inputClass, Badge } from "@/components/ui";

interface FlocageMachine {
  id: string;
  name: string;
  width_cm: number;
  operator_name: string;
}

interface FlocagePricing {
  machine_id: string;
  client_type: string;
  price_per_meter: number;
}

export function FlocageMeterPanel({
  orderId,
  machines,
  pricing,
  onSubmit,
  clientType,
}: {
  orderId: string;
  machines: FlocageMachine[];
  pricing: FlocagePricing[];
  onSubmit: (data: { meters: number; machineId: string }) => void;
  clientType: string | null;
}) {
  const [selectedMachine, setSelectedMachine] = useState<string>("");
  const [meters, setMeters] = useState<string>("");

  const selectedMachineData = machines.find((m) => m.id === selectedMachine);
  const normalizedClientType = (clientType || "detail").toLowerCase().replace(" ", "_");
  const pricingData = pricing.find(
    (p) =>
      p.machine_id === selectedMachine &&
      p.client_type === normalizedClientType
  );
  const estimatedCost = pricingData && meters ? (parseFloat(meters) * pricingData.price_per_meter).toFixed(0) : null;

  const handleSubmit = () => {
    if (!selectedMachine || !meters || parseFloat(meters) <= 0) {
      alert("Veuillez sélectionner une machine et entrer les mètres");
      return;
    }
    onSubmit({
      meters: parseFloat(meters),
      machineId: selectedMachine,
    });
  };

  return (
    <Card className="p-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
          🎨 Flocage — Saisir les mètres avant de terminer
        </h3>
        <Badge tone="amber">Important</Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Machine de flocage" htmlFor="flocage_machine">
          <select
            id="flocage_machine"
            value={selectedMachine}
            onChange={(e) => setSelectedMachine(e.target.value)}
            className={inputClass}
            required
          >
            <option value="">— Sélectionner une machine —</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.width_cm}cm) - {m.operator_name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Mètres à floquer" htmlFor="flocage_meters">
          <input
            id="flocage_meters"
            type="number"
            step="0.1"
            min="0"
            value={meters}
            onChange={(e) => setMeters(e.target.value)}
            placeholder="Ex: 2.5"
            className={inputClass}
            required
          />
        </Field>
      </div>

      {estimatedCost && (
        <div className="mt-4 p-3 bg-white dark:bg-slate-800 rounded border border-amber-200 dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium">{meters} m</span>
            {" × "}
            <span className="font-medium">{pricingData?.price_per_meter} DA/m</span>
            {" = "}
            <span className="font-bold text-amber-600 dark:text-amber-400">
              {estimatedCost} DA
            </span>
          </p>
          {clientType && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Type client: <span className="font-medium capitalize">{clientType.replace("_", " ")}</span>
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!selectedMachine || !meters || parseFloat(meters) <= 0}
          className="flex-1"
        >
          ✓ Confirmer et terminer
        </Button>
      </div>
    </Card>
  );
}
