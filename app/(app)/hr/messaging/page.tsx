import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PageHeader, Card } from "@/components/ui";
import { MessagingInterface } from "@/components/hr/messaging-interface";

export default async function MessagingPage() {
  const supabase = createClient();

  // Récupérer l'employé actuel
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) notFound();

  // Récupérer les info de l'employé
  const { data: currentEmployee } = await supabase
    .from("employees")
    .select("id, first_name, last_name, email, color")
    .eq("auth_user_id", session.user.id)
    .single();

  if (!currentEmployee) notFound();

  // Récupérer tous les employés pour la liste
  const { data: allEmployees } = await supabase
    .from("employees")
    .select("id, first_name, last_name, color")
    .eq("status", "actif")
    .neq("id", currentEmployee.id)
    .order("first_name");

  // Récupérer les conversations récentes
  const { data: recentChats } = await supabase
    .from("employee_messages")
    .select(
      `
      id,
      sender_id,
      recipient_id,
      content,
      created_at,
      sender:employees!sender_id(id, first_name, last_name, color),
      recipient:employees!recipient_id(id, first_name, last_name, color)
    `
    )
    .or(`sender_id.eq.${currentEmployee.id},recipient_id.eq.${currentEmployee.id}`)
    .order("created_at", { ascending: false })
    .limit(100);

  // Grouper les conversations par correspondant
  const conversationMap = new Map<string, any>();
  recentChats?.forEach((msg: any) => {
    const correspondantId = msg.sender_id === currentEmployee.id ? msg.recipient_id : msg.sender_id;
    if (!conversationMap.has(correspondantId)) {
      const correspondant = msg.sender_id === currentEmployee.id ? msg.recipient : msg.sender;
      conversationMap.set(correspondantId, {
        employee: correspondant,
        lastMessage: msg.content,
        lastMessageTime: msg.created_at,
      });
    }
  });

  return (
    <div className="max-w-6xl grid grid-cols-1 lg:grid-cols-4 gap-6">
      <PageHeader
        title="💬 Messagerie Employés"
        description="Communication en temps réel avec vos collègues"
        
      />

      {/* Sidebar: Liste des employés */}
      <div className="lg:col-span-1">
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3 text-slate-900 dark:text-white">
            👥 Employés
          </h3>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {allEmployees?.map((emp: any) => {
              const hasConversation = conversationMap.has(emp.id);
              return (
                <button
                  key={emp.id}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    hasConversation
                      ? "bg-brand-50 dark:bg-brand-900/20 text-slate-900 dark:text-white"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                  onClick={() => {
                    // Scroll to conversation (handled by client component)
                    const el = document.getElementById(`conv-${emp.id}`);
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: emp.color }}
                    />
                    <span className="font-medium text-xs">{emp.first_name}</span>
                  </div>
                  {hasConversation && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                      {conversationMap.get(emp.id)?.lastMessage}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Main: Interface de messagerie */}
      <div className="lg:col-span-3">
        <MessagingInterface
          currentEmployee={currentEmployee}
          employees={allEmployees || []}
          conversations={Array.from(conversationMap.values())}
        />
      </div>
    </div>
  );
}
