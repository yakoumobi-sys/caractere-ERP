"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema } from "@/lib/validation";

export async function signIn(formData: FormData) {
  try {
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!username || !password) {
      redirect(`/login?error=${encodeURIComponent("Nom et mot de passe requis")}`);
    }

    const supabase = createClient();

    // Retrouver l'email à partir du full_name (nom d'utilisateur) dans les profiles
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("email")
      .ilike("full_name", username)
      .limit(1);

    if (profileError || !profiles || profiles.length === 0) {
      redirect(`/login?error=${encodeURIComponent("Utilisateur introuvable")}`);
    }

    const email = profiles[0].email;
    if (!email) {
      redirect(`/login?error=${encodeURIComponent("Email non trouvé pour cet utilisateur")}`);
    }

    // Authentifier avec l'email trouvé
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      redirect(`/login?error=${encodeURIComponent(error.message)}`);
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

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) {
      redirect(`/login?mode=signup&error=${encodeURIComponent(error.message)}`);
    }

    // Stocker l'email dans la table profiles aussi (pour le lookup lors de la connexion)
    if (data.user) {
      await supabase
        .from("profiles")
        .update({ email })
        .eq("id", data.user.id);
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
  await supabase.auth.signOut();
  redirect("/login");
}
