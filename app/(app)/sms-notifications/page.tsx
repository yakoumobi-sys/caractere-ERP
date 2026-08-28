/* eslint-disable react/no-unescaped-entities */
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge } from "@/components/ui";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default async function SMSPage() {
  const supabase = createClient();

  const [{ data: deliveries }, { data: templates }] = await Promise.all([
    supabase
      .from("sms_delivery")
      .select("*, pipeline_orders(order_number)")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("sms_templates").select("*").order("stage"),
  ]);

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    sent: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    undelivered: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  };

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="📱 Notifications SMS"
        description="Gestion des SMS clients et templates"
      />

      {/* Templates SMS */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white">
          📋 Templates SMS
        </h2>
        <div className="grid gap-3">
          {templates?.map((template) => (
            <Card key={template.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="font-semibold text-sm text-slate-900 dark:text-white">
                    {template.description}
                  </p>
                  <p className="text-xs text-slate-500 mt-2 italic">
                    {template.message_template}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">
                    Stage: {template.stage}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Historique SMS */}
      <div>
        <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white">
          📤 Historique Envois
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left px-4 py-2 font-semibold text-slate-900 dark:text-white">
                  Commande
                </th>
                <th className="text-left px-4 py-2 font-semibold text-slate-900 dark:text-white">
                  Stage
                </th>
                <th className="text-left px-4 py-2 font-semibold text-slate-900 dark:text-white">
                  Statut
                </th>
                <th className="text-left px-4 py-2 font-semibold text-slate-900 dark:text-white">
                  Envoyé
                </th>
                <th className="text-left px-4 py-2 font-semibold text-slate-900 dark:text-white">
                  Message
                </th>
              </tr>
            </thead>
            <tbody>
              {deliveries?.map((delivery) => (
                <tr
                  key={delivery.id}
                  className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                    {delivery.pipeline_orders?.order_number || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                    {delivery.stage}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="blue">
                      {delivery.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {delivery.sent_at
                      ? format(new Date(delivery.sent_at), "dd MMM HH:mm", {
                          locale: fr,
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs max-w-xs truncate text-slate-600 dark:text-slate-400">
                    {delivery.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!deliveries?.length && (
            <div className="text-center py-8 text-slate-500">
              Aucun SMS envoyé
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <Card className="p-4 mt-8 bg-blue-50 dark:bg-blue-950/30 border-l-4 border-blue-500">
        <p className="text-sm text-blue-900 dark:text-blue-100">
          💡 <strong>Configuration Twilio:</strong> Les SMS sont envoyés via Twilio.
          Assurez-vous que les variables d'environnement sont configurées:
          <code className="block mt-2 text-xs bg-white dark:bg-slate-900 p-2 rounded font-mono">
            TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
          </code>
        </p>
      </Card>
    </div>
  );
}
