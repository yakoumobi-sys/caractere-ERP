"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema } from "@/lib/validation";

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

  // Retrouver l'employé par prénom
  const { data: employees, error: empError } = await supabase
    .from("employees")
    .select("first_name")
    .ilike("first_name", firstName)
    .limit(1);

  if (empError || !employees || employees.length === 0) {
    redirect(`/login?error=${encodeURIComponent("Utilisateur introuvable")}`);
  }

  // Générer l'email à partir du first_name
  const email = employees[0].first_name.toLowerCase() + "@caractere.com";

  // Authentifier avec l'email trouvé
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

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
  redirect("/login");
}
