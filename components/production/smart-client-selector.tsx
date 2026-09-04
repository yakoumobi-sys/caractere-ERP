"use client";

import { useEffect, useRef, useState } from "react";
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

/**
 * Choix du client : recherche + liste.
 *
 * Seul un client TOUCHÉ dans la liste compte — le texte tapé n'est qu'un
 * filtre. L'ancienne version laissait la recherche affichée telle quelle
 * après la frappe : le commercial croyait avoir choisi son client, envoyait
 * la commande, et l'action serveur répondait « Le client est requis » en
 * effaçant toute la saisie. D'où l'état sélectionné explicite ci-dessous, et
 * la recherche qui repart de zéro tant que rien n'est retenu.
 */
export function SmartClientSelector({ contacts, value, onChange }: SmartClientSelectorProps) {
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = contacts.find((c) => c.id === value);

  // Le menu doit se refermer quand on touche ailleurs : sur mobile il
  // recouvrait les étapes suivantes du configurateur.
  useEffect(() => {
    if (!showDropdown) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [showDropdown]);

  const needle = search.trim().toLowerCase();
  const filteredContacts = needle
    ? contacts.filter((c) => c.name.toLowerCase().includes(needle))
    : contacts.slice(0, 8);

  function select(contact: Contact) {
    onChange(contact.id);
    setSearch("");
    setShowDropdown(false);
  }

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 dark:border-emerald-700 dark:bg-emerald-900/20">
        <span className="min-w-0 truncate text-sm font-semibold text-emerald-900 dark:text-emerald-100">
          ✓ {selected.name}
        </span>
        <button
          type="button"
          onClick={() => {
            onChange("");
            setSearch("");
            setShowDropdown(true);
          }}
          className="shrink-0 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Changer
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        placeholder="Chercher un client…"
        autoComplete="off"
        className={inputClass}
      />
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Touchez le client dans la liste pour le retenir.
      </p>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded mt-1 max-h-64 overflow-y-auto z-20 shadow-lg">
          {filteredContacts.length > 0 ? (
            filteredContacts.map((contact) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => select(contact)}
                className="w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                {contact.name}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
              Aucun client trouvé — utilisez « + Nouveau client » ci-dessus.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
