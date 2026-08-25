"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema } from "@/lib/validation";

// Doit rester synchronisé avec MUST_CHANGE_PASSWORD_COOKIE dans
// lib/supabase/middleware.ts — évite au middleware de re-questionner
// Supabase sur must_change_password à chaque navigation.
const MUST_CHANGE_PASSWORD_COOKIE = "cpw";

export async function signIn(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    redirect(`/login?error=${encodeURIComponent("Nom et mot de passe requis")}`);
  }

  const supabase = createClient();

  // Le menu déroulant envoie le prénom (voir app/login/page.tsx) : on ne
  // matche que sur ce premier mot pour rester robuste si jamais un nom
  // complet est saisi.
  const firstName = username.split(" ")[0];

  // Retrouver le vrai email de connexion via une fonction dédiée : à ce stade
  // (avant authentification) le client tourne avec le rôle "anon", qui n'a
  // pas accès à la table profiles (seule "employees" a une policy publique,
  // pour alimenter le menu déroulant) — un embed employees->profiles(email)
  // renverrait toujours null. Ne JAMAIS reconstruire l'email à partir du
  // prénom non plus : ça ne vaut que pour les comptes créés via
  // prenom@caractere.com — pour un compte créé autrement (ex: l'admin,
  // inscrit avec sa propre adresse), deviner l'email empêche la connexion
  // quel que soit le mot de passe.
  const { data: email, error: empError } = await supabase.rpc("get_login_email", { p_first_name: firstName });

  if (empError || !email) {
    redirect(`/login?error=${encodeURIComponent("Utilisateur introuvable ou compte non configuré")}`);
  }

  // Authentifier avec l'email trouvé
  const { data, error } = await supabase.auth.signInWithPassword({ email: email!, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", data.user.id)
    .single();

  const mustChangePassword = !!profile?.must_change_password;
  cookies().set(MUST_CHANGE_PASSWORD_COOKIE, mustChangePassword ? "1" : "0", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  if (mustChangePassword) {
    redirect("/change-password");
  }

  redirect("/dashboard");
}

export async function changePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (password.length < 6) {
    redirect(`/change-password?error=${encodeURIComponent("Le mot de passe doit faire au minimum 6 caractères")}`);
  }
  if (password !== confirmPassword) {
    redirect(`/change-password?error=${encodeURIComponent("Les mots de passe ne correspondent pas")}`);
  }

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    redirect(`/change-password?error=${encodeURIComponent(updateError.message)}`);
  }

  await supabase.from("profiles").update({ must_change_password: false }).eq("id", user.id);
  cookies().set(MUST_CHANGE_PASSWORD_COOKIE, "0", { httpOnly: true, sameSite: "lax", path: "/" });

  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!email || !password) {
    redirect(`/login?mode=signup&error=${encodeURIComponent("Email et mot de passe requis")}`);
  }

  if (password !== confirmPassword) {
    redirect(`/login?mode=signup&error=${encodeURIComponent("Les mots de passe ne correspondent pas")}`);
  }

  if (password.length < 6) {
    redirect(`/login?mode=signup&error=${encodeURIComponent("Le mot de passe doit faire au minimum 6 caractères")}`);
  }

  const supabase = createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    redirect(`/login?mode=signup&error=${encodeURIComponent(error.message)}`);
  }

  redirect("/login?message=Compte créé, connecte-toi.");
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  cookies().delete(MUST_CHANGE_PASSWORD_COOKIE);
  redirect("/login");
}
