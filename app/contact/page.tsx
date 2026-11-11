"use client";

import { FormEvent, useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button, Input, Textarea, Card } from "@/components";
import type { Creation } from "@/components/CreationCard";
import { optimizeCloudinaryUrl } from "@/lib/imageOptimizer";

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
  const [formStartTime] = useState(() => Date.now());
  const [creations, setCreations] = useState<Creation[]>([]);
  const [selectedCreationIds, setSelectedCreationIds] = useState<string[]>([]);
  const [loadingCreations, setLoadingCreations] = useState(false);
  const [showCreationsSelector, setShowCreationsSelector] = useState(false);
  const [creationsLoaded, setCreationsLoaded] = useState(false);

  // Pré-remplir nom/email quand la session arrive, sans écraser une saisie manuelle
  useEffect(() => {
    if (!session?.user) return;
    setForm((f) => ({
      ...f,
      name: f.name || session.user?.name || "",
      email: f.email || session.user?.email || "",
    }));
  }, [session?.user?.name, session?.user?.email]);

  // Charger les créations uniquement quand le sélecteur devient nécessaire (lazy)
  useEffect(() => {
    if (!showCreationsSelector || creationsLoaded) return;

    const loadCreations = async () => {
      setLoadingCreations(true);
      try {
        const res = await fetch("/api/creations");
        if (res.ok) {
          const data = await res.json();
          setCreations(data);
          setCreationsLoaded(true);
        }
      } catch (error) {
        console.error("Erreur lors du chargement des créations:", error);
      } finally {
        setLoadingCreations(false);
      }
    };
    loadCreations();
  }, [showCreationsSelector, creationsLoaded]);

  // Initialiser la sélection si creationId est présent dans l'URL
  useEffect(() => {
    if (creationId && !selectedCreationIds.includes(creationId)) {
      setSelectedCreationIds([creationId]);
    }
  }, [creationId]);

  // Afficher le sélecteur de créations pour les sujets pertinents
  useEffect(() => {
    const shouldShow = form.subject === "Commander un article identique" || 
                      form.subject === "Question sur une création";
    setShowCreationsSelector(shouldShow);
    if (!shouldShow) {
      setSelectedCreationIds([]);
    } else {
      // Si on passe à un sujet à sélection unique et qu'on a plusieurs créations sélectionnées,
      // on ne garde que la première
      const isSingleSelection = form.subject === "Commander un article identique" || 
                                form.subject === "Question sur une création";
      if (isSingleSelection) {
        setSelectedCreationIds(prev => prev.length > 1 ? [prev[0]] : prev);
      }
    }
  }, [form.subject]);

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
      // Le honeypot part aussi au serveur : les robots postent sans passer par cette page
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          creationId: creationId || null,
          creationIds: selectedCreationIds.length > 0 ? selectedCreationIds : undefined,
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
        setSelectedCreationIds([]);
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
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 cursor-pointer"
              >
                <option value="">Sélectionnez un sujet</option>
                <option value="Commander un article identique">Commander un article identique</option>
                <option value="Question sur une création">Question sur une création</option>
                <option value="Question générale">Question générale</option>
                <option value="Autre">Autre</option>
              </select>
            </div>

            {/* Sélecteur de créations */}
            {showCreationsSelector && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-700">
                  {form.subject === "Commander un article identique" || form.subject === "Question sur une création"
                    ? "Sélectionnez une création *"
                    : "Sélectionnez une ou plusieurs créations *"}
                </label>
                {loadingCreations ? (
                  <p className="text-sm text-slate-500">Chargement des créations...</p>
                ) : creations.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucune création disponible.</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-300 bg-white p-2">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[...creations]
                        .sort((a, b) => {
                          const aSelected = selectedCreationIds.includes(a._id);
                          const bSelected = selectedCreationIds.includes(b._id);
                          if (aSelected && !bSelected) return -1;
                          if (!aSelected && bSelected) return 1;
                          return 0;
                        })
                        .map((creation) => {
                        const isSelected = selectedCreationIds.includes(creation._id);
                        return (
                          <div
                            key={creation._id}
                            onClick={() => {
                              // Pour "Commander un article identique" et "Question sur une création", 
                              // on ne peut sélectionner qu'une seule création
                              const isSingleSelection = form.subject === "Commander un article identique" || 
                                                       form.subject === "Question sur une création";
                              
                              if (isSelected) {
                                setSelectedCreationIds(selectedCreationIds.filter(id => id !== creation._id));
                              } else {
                                if (isSingleSelection) {
                                  // Remplacer la sélection par la nouvelle
                                  setSelectedCreationIds([creation._id]);
                                } else {
                                  // Ajouter à la sélection existante
                                  setSelectedCreationIds([...selectedCreationIds, creation._id]);
                                }
                              }
                            }}
                            className={`relative p-1.5 rounded-lg border-2 cursor-pointer transition-all ${
                              isSelected
                                ? "border-blue-500 bg-blue-50"
                                : "border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <div className="absolute top-1.5 right-1.5 z-10">
                              {isSelected ? (
                                <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              ) : (
                                <div className="w-4 h-4 rounded-full border-2 border-slate-300 bg-white"></div>
                              )}
                            </div>
                            {creation.imageUrl || (creation.images && creation.images[0]) ? (
                              <img
                                src={optimizeCloudinaryUrl((creation.imageUrl || creation.images?.[0])!, { width: 200 })}
                                alt={creation.title}
                                title={creation.title}
                                className="w-full aspect-square object-cover rounded"
                              />
                            ) : (
                              <div className="w-full aspect-square bg-slate-200 rounded flex items-center justify-center text-[10px] text-slate-400">
                                Pas d&apos;image
                              </div>
                            )}
                            <div className="mt-1.5">
                              <p className="text-[11px] font-medium text-slate-900 truncate leading-tight">{creation.title}</p>
                              {creation.price != null && (
                                <p className="text-[10px] text-slate-600 mt-0.5">{creation.price} €</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {selectedCreationIds.length > 0 && (
                  <p className="text-xs text-slate-600">
                    {selectedCreationIds.length} création{selectedCreationIds.length > 1 ? "s" : ""} sélectionnée{selectedCreationIds.length > 1 ? "s" : ""}
                  </p>
                )}
              </div>
            )}

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
              <Button 
                type="submit" 
                disabled={loading || (showCreationsSelector && selectedCreationIds.length === 0)} 
                className="cursor-pointer"
              >
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
