"use client";

import { useState, useEffect, useRef } from "react";
import { sendEmployeeMessage } from "@/app/actions/messaging-actions";
import { Card, Button, inputClass } from "@/components/ui";

interface Employee {
  id: string;
  first_name: string;
  last_name?: string;
  color?: string;
}

interface Conversation {
  employee: Employee;
  lastMessage: string;
  lastMessageTime: string;
}

export function MessagingInterface({
  currentEmployee,
  employees,
  conversations,
}: {
  currentEmployee: Employee;
  employees: Employee[];
  conversations: Conversation[];
}) {
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    conversations[0]?.employee || employees[0] || null
  );
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom quand les messages changent
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Charger les messages quand on change de correspondant
  useEffect(() => {
    if (!selectedEmployee) return;

    const loadMessages = async () => {
      // Simulé - en production, utiliser Supabase en temps réel
      setMessages([]);
    };

    loadMessages();
  }, [selectedEmployee]);

  const handleSendMessage = async () => {
    if (!selectedEmployee || !newMessage.trim()) return;

    setLoading(true);
    try {
      await sendEmployeeMessage({
        recipientId: selectedEmployee.id,
        content: newMessage,
      });

      // Ajouter le message à la liste localement
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender_id: currentEmployee.id,
          recipient_id: selectedEmployee.id,
          content: newMessage,
          created_at: new Date().toISOString(),
          is_read: false,
        },
      ]);

      setNewMessage("");
    } catch (error) {
      console.error("Erreur envoi message:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)]">
      {/* Header: Info correspondant */}
      {selectedEmployee && (
        <Card className="p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-full"
              style={{ backgroundColor: selectedEmployee.color }}
            />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">
                {selectedEmployee.first_name} {selectedEmployee.last_name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Connecté</p>
            </div>
          </div>
          <select
            value={selectedEmployee.id}
            onChange={(e) => {
              const emp = employees.find((e) => e.id === e.target.value);
              setSelectedEmployee(emp || null);
            }}
            className={`${inputClass} w-48`}
          >
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.first_name}
              </option>
            ))}
          </select>
        </Card>
      )}

      {/* Messages container */}
      <Card className="flex-1 p-4 mb-4 overflow-y-auto space-y-3 bg-slate-50 dark:bg-slate-900/30">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-400 dark:text-slate-500">
              Aucun message. Commence une conversation!
            </p>
          </div>
        )}

        {messages.map((msg: any) => {
          const isFromCurrentUser = msg.sender_id === currentEmployee.id;
          return (
            <div
              key={msg.id}
              className={`flex ${isFromCurrentUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-xs px-4 py-2 rounded-lg ${
                  isFromCurrentUser
                    ? "bg-brand-600 text-white rounded-br-none"
                    : "bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-bl-none border border-slate-200 dark:border-slate-700"
                }`}
              >
                <p className="text-sm">{msg.content}</p>
                <p className={`text-xs mt-1 ${isFromCurrentUser ? "text-brand-100" : "text-slate-500 dark:text-slate-400"}`}>
                  {new Date(msg.created_at).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </Card>

      {/* Input message */}
      {selectedEmployee && (
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Écris un message..."
            className={`${inputClass} flex-1`}
            disabled={loading}
          />
          <Button
            type="button"
            onClick={handleSendMessage}
            disabled={loading || !newMessage.trim()}
            className="px-6"
          >
            {loading ? "..." : "Envoyer"}
          </Button>
        </div>
      )}
    </div>
  );
}
