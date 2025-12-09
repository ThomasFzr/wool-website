"use client";

import { FormEvent, useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button, Input, Textarea, Card } from "@/components";

function ContactForm() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const creationId = searchParams.get("creation");
  const subjectParam = searchParams.get("subject");

  // Initialiser le sujet en fonction des paramètres URL
  const getInitialSubject = () => {
    if (subjectParam === "commande") {
      return "Commander un article identique";
    } else if (creationId) {
      return "Question sur une création";
    }
    return "";
  };

  const [form, setForm] = useState({
    name: session?.user?.name || "",
    email: session?.user?.email || "",
    subject: getInitialSubject(),
    message: "",
    website: "", // Honeypot
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [formStartTime] = useState(Date.now());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    // Protection honeypot
    if (form.website) {
      setMessage({ type: "error", text: "Soumission invalide." });
      setLoading(false);
      return;
    }

    // Protection timing (minimum 2 secondes)
    const timeTaken = Date.now() - formStartTime;
    if (timeTaken < 2000) {
      setMessage({ type: "error", text: "Veuillez remplir le formulaire plus attentivement." });
      setLoading(false);
      return;
    }

    try {
      const { website, ...formData } = form;
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          creationId: creationId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors de l'envoi");
      }

      setMessage({
        type: "success",
        text: "✅ Votre message a bien été envoyé ! Nous vous répondrons rapidement.",
      });

      // Reset le formulaire après 2 secondes
      setTimeout(() => {
        setForm({
          name: session?.user?.name || "",
          email: session?.user?.email || "",
          subject: "",
          message: "",
          website: "",
        });
        if (!creationId) {
          router.push("/");
        }
      }, 2000);
    } catch (error: any) {
      setMessage({
        type: "error",
        text: error.message || "Une erreur est survenue.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-4"
          >
            ← Retour à l&apos;accueil
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            📧 Contactez-nous
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Une question ? Une demande particulière ? N&apos;hésitez pas à nous contacter !
          </p>
        </div>

        {creationId && (
          <div className="mb-4 rounded-lg bg-blue-50 border border-blue-200 p-4">
            <p className="text-sm text-blue-800">
              📦 {subjectParam === "commande" 
                ? "L'article que vous souhaitez commander est indiqué en pièce jointe par défaut." 
                : "Votre message concerne une création spécifique."}
            </p>
          </div>
        )}

        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Nom *"
              placeholder="Votre nom"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />

            <Input
              label="Email *"
              type="email"
              placeholder="votre@email.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">
                Sujet *
              </label>
              <select
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 cursor-pointer"
              >
                <option value="">Sélectionnez un sujet</option>
                <option value="Commander un article identique">Commander un article identique</option>
                <option value="Question sur une création">Question sur une création</option>
                <option value="Demande de personnalisation">Demande de personnalisation</option>
                <option value="Question générale">Question générale</option>
                <option value="Autre">Autre</option>
              </select>
            </div>

            {/* Honeypot - champ invisible pour les bots */}
            <input
              type="text"
              name="website"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              autoComplete="off"
              tabIndex={-1}
              style={{ position: "absolute", left: "-9999px" }}
              aria-hidden="true"
            />

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">
                Message *
              </label>
              <Textarea
                placeholder="Votre message..."
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                rows={6}
                required
              />
            </div>

            {message && (
              <div
                className={`rounded-lg p-3 text-sm ${
                  message.type === "success"
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {message.text}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={loading} className="cursor-pointer">
                {loading ? "Envoi..." : "📧 Envoyer le message"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.back()}
                className="cursor-pointer"
              >
                Annuler
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </main>
  );
}

export default function ContactPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-600">Chargement...</div>
      </main>
    }>
      <ContactForm />
    </Suspense>
  );
}
