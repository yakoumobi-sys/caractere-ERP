"use client";

import { useState, useEffect } from "react";
import { Card, Badge, Field, inputClass } from "@/components/ui";
import Link from "next/link";

interface Sale {
  id: string;
  number: string;
  contact_name: string;
  contact_id: string;
  order_total: number;
  payment_status: "unpaid" | "partial" | "paid";
  created_at: string;
  technique: string;
  status: string;
}

interface DailySalesListProps {
  sales: Sale[];
}

const STATUS_COLORS: Record<string, string> = {
  unpaid: "red",
  partial: "amber",
  paid: "green",
};

const PAYMENT_LABELS: Record<string, string> = {
  unpaid: "Non payée",
  partial: "Partiel",
  paid: "Payée",
};

export function DailySalesList({ sales }: DailySalesListProps) {
  const [filteredSales, setFilteredSales] = useState(sales);
  const [clientFilter, setClientFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Filter sales when filters change
  useEffect(() => {
    let filtered = [...sales];

    // Filter by client name
    if (clientFilter) {
      filtered = filtered.filter((sale) =>
        sale.contact_name.toLowerCase().includes(clientFilter.toLowerCase())
      );
    }

    // Filter by date range
    if (startDate) {
      const start = new Date(startDate);
      filtered = filtered.filter((sale) => new Date(sale.created_at) >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter((sale) => new Date(sale.created_at) <= end);
    }

    setFilteredSales(filtered);
  }, [clientFilter, startDate, endDate, sales]);

  // Calculate totals
  const totalSales = filteredSales.reduce((sum, s) => sum + (s.order_total || 0), 0);
  const paidCount = filteredSales.filter((s) => s.payment_status === "paid").length;
  const unpaidCount = filteredSales.filter((s) => s.payment_status === "unpaid").length;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="p-4 bg-slate-50">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">🔍 Filtres</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Client" htmlFor="client-filter">
            <input
              id="client-filter"
              type="text"
              placeholder="Nom du client..."
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="De" htmlFor="start-date">
            <input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="À" htmlFor="end-date">
            <input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      {/* Summary */}
      <Card className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200">
        <div className="grid grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-600">Commandes</p>
            <p className="text-2xl font-bold text-slate-900">{filteredSales.length}</p>
          </div>
          <div>
            <p className="text-xs text-slate-600">Total</p>
            <p className="text-2xl font-bold text-blue-600">{totalSales.toLocaleString()} DA</p>
          </div>
          <div>
            <p className="text-xs text-slate-600">Payées</p>
            <p className="text-2xl font-bold text-green-600">{paidCount}</p>
          </div>
          <div>
            <p className="text-xs text-slate-600">En attente</p>
            <p className="text-2xl font-bold text-red-600">{unpaidCount}</p>
          </div>
        </div>
      </Card>

      {/* Sales List */}
      <Card>
        {filteredSales.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <p>Aucune vente trouvée pour ces critères</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Commande</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Client</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Type</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Total</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-900">Paiement</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((sale) => (
                  <tr key={sale.id} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/production/${sale.id}`} className="font-medium text-blue-600 hover:underline">
                        {sale.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{sale.contact_name}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-1 bg-slate-100 text-slate-700 rounded">
                        {sale.technique === "dtf" ? "DTF" : sale.technique === "broderie" ? "Broderie" : "Autre"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {(sale.order_total || 0).toLocaleString()} DA
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        tone={STATUS_COLORS[sale.payment_status] as any}
                      >
                        {PAYMENT_LABELS[sale.payment_status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {new Date(sale.created_at).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
