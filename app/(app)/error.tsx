"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { IconAlert } from "@/components/icons";

export default function AppErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <Card className="w-full max-w-sm p-8">
        <div className="flex justify-center mb-4">
          <div className="h-12 w-12 rounded-lg bg-red-100 dark:bg-red-500/10 flex items-center justify-center">
            <IconAlert className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
        </div>

        <div className="text-center mb-6">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            Erreur lors du chargement
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {error.message || "Une erreur inattendue s'est produite."}
          </p>
          {error.digest && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
              Code: {error.digest}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button onClick={reset} className="flex-1">
            Réessayer
          </Button>
          <Link href="/dashboard" className="flex-1">
            <Button variant="secondary" className="w-full">
              Retour au tableau de bord
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
