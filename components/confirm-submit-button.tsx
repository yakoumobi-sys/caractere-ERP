"use client";

import { Button } from "@/components/ui";

/**
 * Bouton d'envoi qui demande confirmation avant de soumettre son formulaire.
 *
 * Pour les suppressions déclenchées par une action serveur (« Supprimer »
 * une commande, un client…) : jusqu'ici un simple clic suffisait, sans
 * possibilité de revenir en arrière.
 */
export function ConfirmSubmitButton({
  message,
  children,
  variant = "danger",
  className,
}: {
  message: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
}) {
  return (
    <Button
      type="submit"
      variant={variant}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
