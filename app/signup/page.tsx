'use client';

import { useState } from 'react';
import { Button, Card, Field, inputClass } from '@/components/ui';
import Link from 'next/link';

export default function SignupPage() {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const firstName = formData.get('first_name') as string;
    const lastName = formData.get('last_name') as string;

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, firstName, lastName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Erreur lors de la création du compte');
        return;
      }

      setSuccess('Compte créé! Redirection...');
      setTimeout(() => window.location.href = '/admin/dashboard', 2000);
    } catch (err) {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <div className="text-3xl font-bold text-brand-600 mb-2">CARACTÈRE</div>
          <p className="text-sm text-slate-600 dark:text-slate-400">Créer un compte</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 rounded bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 text-sm text-green-700 dark:text-green-300">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Prénom" htmlFor="first_name" required>
            <input id="first_name" name="first_name" type="text" required className={inputClass} />
          </Field>

          <Field label="Nom" htmlFor="last_name" required>
            <input id="last_name" name="last_name" type="text" required className={inputClass} />
          </Field>

          <Field label="Email" htmlFor="email" required>
            <input id="email" name="email" type="email" required className={inputClass} />
          </Field>

          <Field label="Mot de passe" htmlFor="password" required>
            <input id="password" name="password" type="password" required minLength={6} className={inputClass} />
          </Field>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Création...' : 'Créer le compte'}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm">
          <p className="text-slate-600 dark:text-slate-400">
            Déjà inscrit?{' '}
            <Link href="/login" className="text-brand-600 dark:text-brand-400 hover:underline">
              Se connecter
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
