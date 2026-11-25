"use client";
import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";
import { btn, inputCls } from "@/components/ui";

export function SupabaseLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
        const { error } = await sb.auth.signInWithPassword({ email, password });
        setBusy(false);
        if (error) setError("Identifiants incorrects.");
        else window.location.href = "/";
      }}
    >
      <label className="block text-sm">E-mail<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls + " mt-1"} autoComplete="email" /></label>
      <label className="block text-sm">Mot de passe<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls + " mt-1"} autoComplete="current-password" /></label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button disabled={busy} className={btn("primary") + " w-full"}>{busy ? "Connexion…" : "Se connecter"}</button>
    </form>
  );
}
