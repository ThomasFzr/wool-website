// app/reset-password/page.tsx
"use client";

import { FormEvent, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PASSWORD_MESSAGES, PASSWORD_MIN_LENGTH, passwordLength } from "@/lib/password-policy";

function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Lu directement dans l'URL : avec un état rempli par un effet, le premier rendu
  // affichait « Token invalide » un instant même avec un lien valide.
  const token = searchParams.get("token");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (password !== confirmPassword) {
      setMessage("Les mots de passe ne correspondent pas");
      return;
    }

    if (passwordLength(password) < PASSWORD_MIN_LENGTH) {
      setMessage(PASSWORD_MESSAGES.tooShort);
      return;
    }

    if (!token) {
      setMessage("Token manquant");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || "Une erreur est survenue");
        setIsLoading(false);
        return;
      }

      setMessage("Mot de passe réinitialisé avec succès ! Redirection...");
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (error) {
      setMessage("Une erreur est survenue. Veuillez réessayer.");
      setIsLoading(false);
    }
  }

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <h1 className="text-xl font-semibold mb-2 text-red-600">Token invalide</h1>
          <p className="text-sm text-slate-600 mb-4">
            Le lien de réinitialisation est invalide ou a expiré.
          </p>
          <Link
            href="/forgot-password"
            className="text-xs text-slate-600 underline"
          >
            Demander un nouveau lien
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <h1 className="text-xl font-semibold mb-2">Nouveau mot de passe</h1>
        <p className="text-sm text-slate-600 mb-4">
          Choisissez un nouveau mot de passe pour votre compte.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            placeholder="Nouveau mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={PASSWORD_MIN_LENGTH}
            className="w-full rounded-lg border px-3 py-2 text-base"
          />

          <input
            type="password"
            placeholder="Confirmer le mot de passe"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={PASSWORD_MIN_LENGTH}
            className="w-full rounded-lg border px-3 py-2 text-base"
          />

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-full bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isLoading ? "Réinitialisation..." : "Réinitialiser le mot de passe"}
          </button>
        </form>

        <Link
          href="/login"
          className="mt-3 block text-xs text-slate-600 underline text-center"
        >
          Retour à la connexion
        </Link>

        {message && (
          <p className={`mt-3 text-xs ${message.includes("erreur") || message.includes("invalide") || message.includes("correspondent pas") ? "text-red-600" : "text-green-600"}`}>
            {message}
          </p>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <p className="text-sm text-slate-600">Chargement...</p>
        </div>
      </main>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
