"use client";
import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { btn } from "./ui";

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random();
}

export type ActionResult = { ok?: string; error?: string } | null;
type Action = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

export function SubmitButton({ children, variant = "primary", className, confirm }: { children: ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger"; className?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={btn(variant) + " " + (className || "")}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "…" : children}
    </button>
  );
}

/** Formulaire relié à une server action : bouton désactivé pendant l'envoi (anti double clic) et message de retour. */
export function ActionForm({ action, children, className, resetOnSuccess, idempotent }: { action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean; idempotent?: boolean }) {
  const [state, formAction] = useFormState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const [key, setKey] = useState(newKey);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
    if (state?.ok && idempotent) setKey(newKey());
  }, [state, resetOnSuccess, idempotent]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {idempotent && <input type="hidden" name="idempotency_key" value={key} />}
      {children}
      {state?.error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>}
    </form>
  );
}
