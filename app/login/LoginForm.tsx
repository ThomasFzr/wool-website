// app/login/LoginForm.tsx
"use client";

import { FormEvent, useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeCallbackPath } from "@/lib/safe-redirect";

export default function LoginForm() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackPath(searchParams.get("callbackUrl"));

  // On affiche un message si NextAuth renvoie ?error=...
  useEffect(() => {
    const err = searchParams.get("error");
    if (err) {
      setMessage("Erreur de connexion (Google). Réessayez ou utilisez l'email.");
    }
  }, [searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      if (mode === "register") {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        if (!res.ok) {
          // L'API renvoie un message adapté (email déjà utilisé, invalide, trop d'essais…)
          const data = await res.json().catch(() => null);
          setMessage(data?.error || "Inscription impossible, réessayez plus tard.");
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

      router.push(callbackUrl);
    } catch {
      setMessage("Erreur réseau, réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <h1 className="text-xl font-semibold mb-4">
          {mode === "login" ? "Se connecter" : "Créer un compte"}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "register" && (
            <input
              placeholder="Nom"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-base"
            />
          )}

          <input
            type="email"
            placeholder="Email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-base"
          />

          <input
            type="password"
            placeholder="Mot de passe"
            required
            minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-base"
          />

          {mode === "login" && (
            <div className="text-right">
              <a
                href="/forgot-password"
                className="text-xs text-slate-600 underline"
              >
                Mot de passe oublié ?
              </a>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-slate-900 px-3 py-2 text-sm font-semibold text-white cursor-pointer hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
          >
            {loading
              ? "Patientez…"
              : mode === "login"
                ? "Se connecter"
                : "Créer le compte"}
          </button>
        </form>

        <button
          className="mt-3 text-xs text-slate-600 underline cursor-pointer"
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
            type="button"
            onClick={() =>
              signIn("google", {
                callbackUrl,
              })
            }
            className="w-full rounded-full border px-3 py-2 text-sm cursor-pointer hover:bg-slate-50"
          >
            Continuer avec Google
          </button>
        </div>

        {message && <p className="mt-3 text-xs text-red-600">{message}</p>}
      </div>
    </main>
  );
}