// app/forgot-password/page.tsx
"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || "Une erreur est survenue");
        setIsLoading(false);
        return;
      }

      setMessage("Un email de réinitialisation a été envoyé si ce compte existe.");
      setEmail("");
    } catch (error) {
      setMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <h1 className="text-xl font-semibold mb-2">Mot de passe oublié</h1>
        <p className="text-sm text-slate-600 mb-4">
          Entrez votre adresse email et nous vous enverrons un lien pour réinitialiser votre mot de passe.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-full bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isLoading ? "Envoi..." : "Envoyer le lien"}
          </button>
        </form>

        <Link
          href="/login"
          className="mt-3 block text-xs text-slate-600 underline text-center"
        >
          Retour à la connexion
        </Link>

        {message && (
          <p className={`mt-3 text-xs ${message.includes("erreur") ? "text-red-600" : "text-green-600"}`}>
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
