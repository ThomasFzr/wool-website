"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error"); // ex: OAuthSignin, etc.

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (mode === "register") {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) {
        setMessage("Inscription impossible (email déjà utilisé ?)");
        return;
      }
    }

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (res?.error) {
      setMessage("Connexion impossible.");
      return;
    }

    router.push("/");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <h1 className="text-xl font-semibold mb-4">
          {mode === "login" ? "Se connecter" : "Créer un compte"}
        </h1>

        {/* Message d'erreur OAuth (Google) éventuel */}
        {oauthError && !message && (
          <p className="mb-3 text-xs text-red-600">
            Une erreur est survenue lors de la connexion avec Google. Réessaie.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "register" && (
            <input
              placeholder="Nom"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />

          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />

          <button
            type="submit"
            className="w-full rounded-full bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
          >
            {mode === "login" ? "Se connecter" : "Créer le compte"}
          </button>
        </form>

        <button
          className="mt-3 text-xs text-slate-600 underline"
          onClick={() =>
            setMode((m) => (m === "login" ? "register" : "login"))
          }
        >
          {mode === "login"
            ? "Pas encore de compte ? Créer un compte"
            : "Déjà un compte ? Se connecter"}
        </button>

        <div className="mt-4 border-t pt-4">
          <button
            onClick={() =>
              signIn("google", {
                callbackUrl: "/", // 👈 redirige vers la home une fois loggué
              })
            }
            className="w-full rounded-full border px-3 py-2 text-sm"
          >
            Continuer avec Google
          </button>
        </div>

        {message && <p className="mt-3 text-xs text-red-600">{message}</p>}
      </div>
    </main>
  );
}