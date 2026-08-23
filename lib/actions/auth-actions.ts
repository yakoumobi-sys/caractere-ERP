"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema } from "@/lib/validation";

export async function signIn(formData: FormData) {
  try {
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    // Valider les données
    const result = signInSchema.safeParse({ email, password });
    if (!result.success) {
      const firstError = result.error.errors[0]?.message || "Données invalides";
      redirect(`/login?error=${encodeURIComponent(firstError)}`);
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      redirect(`/login?error=${encodeURIComponent(error.message)}`);
    }

    if (data.user) {
      // Ferme toute session restée ouverte (déconnexion manquée, fermeture d'onglet...)
      // puis ouvre le pointage du jour.
      await supabase
        .from("time_logs")
        .update({ ended_at: new Date().toISOString() })
        .eq("profile_id", data.user.id)
        .is("ended_at", null);
      await supabase.from("time_logs").insert({ profile_id: data.user.id });
    }

    redirect("/dashboard");
  } catch (error) {
    redirect(`/login?error=${encodeURIComponent("Une erreur s'est produite. Réessaye.")}`);
  }
}

export async function signUp(formData: FormData) {
  try {
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const fullName = String(formData.get("full_name") ?? "");

    // Valider les données
    const result = signUpSchema.safeParse({ email, password, full_name: fullName });
    if (!result.success) {
      const firstError = result.error.errors[0]?.message || "Données invalides";
      redirect(`/login?mode=signup&error=${encodeURIComponent(firstError)}`);
    }

    const supabase = createClient();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) {
      redirect(`/login?mode=signup&error=${encodeURIComponent(error.message)}`);
    }
    redirect("/login?message=Compte créé, connecte-toi.");
  } catch (error) {
    redirect(
      `/login?mode=signup&error=${encodeURIComponent("Une erreur s'est produite. Réessaye.")}`
    );
  }
}

export async function signOut() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await supabase
      .from("time_logs")
      .update({ ended_at: new Date().toISOString() })
      .eq("profile_id", user.id)
      .is("ended_at", null);
  }

  await supabase.auth.signOut();
  redirect("/login");
}
