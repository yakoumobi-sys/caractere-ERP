"use client";

import { Card } from "@/components/ui";

interface WorkshopCapacity {
  department: string;
  current: number;
  employees: number;
  avgPerEmployee: number;
}

export function CapacityByWorkshop({ data }: { data: WorkshopCapacity[] }) {
  if (!data || data.length === 0) {
    return (
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Charge par atelier</h2>
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">Aucune donnée disponible.</p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Charge par atelier</h2>
      <div className="space-y-3">
        {data.map((ws) => {
          const utilization = ws.employees > 0 ? (ws.avgPerEmployee / 10) * 100 : 0; // Target 10 per employee
          const isOverloaded = ws.avgPerEmployee > 12;
          return (
            <div key={ws.department}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{ws.department}</p>
                <div className="text-xs text-slate-500 dark:text-slate-400 space-x-1">
                  <span>{ws.current} commandes</span>
                  <span>·</span>
                  <span>{ws.employees} person{ws.employees > 1 ? "nes" : "ne"}</span>
                </div>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all rounded-full ${
                    isOverloaded ? "bg-red-500" : utilization > 80 ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min(utilization, 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                {ws.avgPerEmployee.toFixed(1)} par personne {isOverloaded && "⚠️ Surchargé"}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
