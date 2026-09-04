"use client";

import { useTransition } from "react";
import { toggleUserActive, updateUserRole } from "@/lib/actions/settings-actions";
import { ROLE_LABELS } from "@/lib/roles";
import type { UserRole } from "@/types/database";
import { inputClass } from "@/components/ui";

const ROLES = Object.keys(ROLE_LABELS) as UserRole[];

export function UserRow({ user }: { user: { id: string; full_name: string | null; role: UserRole; is_active: boolean } }) {
  const [isPending, startTransition] = useTransition();

  return (
    <tr>
      <td className="px-4 py-2.5 text-slate-700">{user.full_name ?? "—"}</td>
      <td className="px-4 py-2.5">
        <select
          defaultValue={user.role}
          disabled={isPending}
          onChange={(e) => startTransition(() => updateUserRole(user.id, e.target.value))}
          className={`${inputClass} py-1`}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2.5">
        {/* Désactiver un compte le coupe de TOUT l'ERP : les policies RLS
            commencent toutes par is_active_user(). Deux employés se sont
            retrouvés bloqués ainsi, sans que personne ne comprenne pourquoi
            leurs commandes ne partaient plus — d'où la confirmation. */}
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            if (
              user.is_active &&
              !window.confirm(
                `Désactiver ${user.full_name ?? "ce compte"} ?\n\n` +
                  "La personne pourra encore se connecter, mais ne verra plus rien et ne pourra " +
                  "plus créer de commande ni rien enregistrer."
              )
            ) {
              return;
            }
            startTransition(() => toggleUserActive(user.id, !user.is_active));
          }}
          className={
            user.is_active
              ? "rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700"
              : "rounded-full border border-red-300 bg-red-50 px-3 py-1 text-sm font-medium text-red-700"
          }
          title={user.is_active ? "Cliquer pour désactiver l'accès" : "Cliquer pour réactiver l'accès"}
        >
          {user.is_active ? "Actif" : "Désactivé — aucun accès"}
        </button>
      </td>
    </tr>
  );
}
