"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inputClass } from "@/components/ui";

interface Contact {
  id: string;
  name: string;
}

interface SmartClientSelectorProps {
  contacts: Contact[];
  value: string;
  onChange: (contactId: string) => void;
}

export function SmartClientSelector({
  contacts,
  value,
  onChange,
}: SmartClientSelectorProps) {
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const currentContact = contacts.find((c) => c.id === value);

  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (contactId: string) => {
    onChange(contactId);
    const contact = contacts.find((c) => c.id === contactId);
    setSearch(contact?.name || "");
    setShowDropdown(false);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={search || currentContact?.name || ""}
        onChange={(e) => {
          setSearch(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        placeholder="Chercher un client..."
        className={inputClass}
      />
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded mt-1 max-h-64 overflow-y-auto z-20 shadow-lg">
          {filteredContacts.length > 0 ? (
            filteredContacts.map((contact) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => handleSelect(contact.id)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  value === contact.id
                    ? "bg-brand-100 dark:bg-brand-900/30 text-brand-900 dark:text-brand-100 font-semibold"
                    : "hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                {contact.name}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
              Aucun client trouvé
            </div>
          )}
        </div>
      )}
    </div>
  );
}
