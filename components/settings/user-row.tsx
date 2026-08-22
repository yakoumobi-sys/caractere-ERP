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
        <button
          disabled={isPending}
          onClick={() => startTransition(() => toggleUserActive(user.id, !user.is_active))}
          className={user.is_active ? "text-emerald-600 text-sm" : "text-slate-400 text-sm"}
        >
          {user.is_active ? "Actif" : "Désactivé"}
        </button>
      </td>
    </tr>
  );
}
