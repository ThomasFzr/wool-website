"use client";

import Link from "next/link";
import { FormEvent, useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button, Input, Textarea, Card, Badge } from "@/components";

function AdminContent() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [message, setMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState({ 
    title: "", 
    subtitle: "",
    colors: [] as string[],
    types: [] as string[]
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [pendingReservations, setPendingReservations] = useState(0);
  const [newMessages, setNewMessages] = useState(0);
  const [newColor, setNewColor] = useState("");
  const [newType, setNewType] = useState("");

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (!res.ok) return;
        const s = await res.json();
        
        // Supprimer les doublons et trier
        const colors: string[] = s.colors ?? [];
        const types: string[] = s.types ?? [];
        const uniqueColors = [...new Set(colors)];
        const uniqueTypes = [...new Set(types)];
        
        // Trier les couleurs alphabétiquement (multicolore en dernier)
        const sortedColors = uniqueColors
          .filter(c => c !== "multicolore")
          .sort((a, b) => a.localeCompare(b, 'fr'))
          .concat(uniqueColors.filter(c => c === "multicolore"));
        
        // Trier les types alphabétiquement
        const sortedTypes = uniqueTypes.sort((a, b) => a.localeCompare(b, 'fr'));
        
        setSettings({
          title: s.title ?? "Les créations en laine de maman",
          subtitle: s.subtitle ?? "Clique sur une création pour voir toutes les photos.",
          colors: sortedColors,
          types: sortedTypes,
        });
      } catch (err) {
        console.error(err);
      }
    }
    loadSettings();
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated" || session?.user?.role !== "admin") {
      router.push("/");
    }
  }, [session, status, router]);

  useEffect(() => {
    if (session?.user?.role === "admin") {
      loadPendingReservations();
      loadNewMessages();
    }
  }, [session]);

  async function loadPendingReservations() {
    try {
      const res = await fetch("/api/admin/reservations/count");
      if (!res.ok) return;
      const data = await res.json();
      setPendingReservations(data.pending || 0);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadNewMessages() {
    try {
      const res = await fetch("/api/admin/contact/count");
      if (!res.ok) return;
      const data = await res.json();
      setNewMessages(data.new || 0);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    try {
      setSavingSettings(true);
      setMessage(null);

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!res.ok) {
        setMessage("Impossible d'enregistrer le texte.");
        return;
      }

      const savedData = await res.json();

      // Recharger les settings depuis la BDD pour être sûr d'avoir les bonnes valeurs
      setSettings({
        title: savedData.title ?? settings.title,
        subtitle: savedData.subtitle ?? settings.subtitle,
        colors: savedData.colors ?? settings.colors,
        types: savedData.types ?? settings.types,
      });

      setMessage("Paramètres enregistrés ✔️");
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setMessage("Erreur serveur lors de l'enregistrement.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveColorsAndTypes() {
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        console.error("Erreur lors de la sauvegarde");
      }
    } catch (err) {
      console.error(err);
    }
  }

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-600">Chargement...</div>
      </main>
    );
  }

  if (!session || session.user.role !== "admin") {
    return null;
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-2"
            >
              ← Retour à l&apos;accueil
            </Link>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Administration
            </h1>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Link
              href="/admin/creations"
              className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-200 transition"
            >
              <span>🧶 Créations</span>
            </Link>
            <Link
              href="/admin/stats"
              className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-200 transition"
            >
              <span>📊 Statistiques</span>
            </Link>
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-200 transition"
            >
              <span>👥 Utilisateurs</span>
            </Link>
            <Link
              href="/admin/contact"
              className="relative inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-200 transition"
              onClick={loadNewMessages}
            >
              <span>📧 Messages</span>
              {newMessages > 0 && (
                <span className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-semibold">
                  {newMessages}
                </span>
              )}
            </Link>
            <Link
              href="/admin/reservations"
              className="relative inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-200 transition"
              onClick={loadPendingReservations}
            >
              <span>📋 Réservations</span>
              {pendingReservations > 0 && (
                <span className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-semibold">
                  {pendingReservations}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Message de succès/erreur */}
        {message && (
          <div className={`mb-4 rounded-lg p-3 text-sm ${
            message.includes("✔️") 
              ? "bg-green-50 text-green-800 border border-green-200" 
              : "bg-red-50 text-red-800 border border-red-200"
          }`}>
            {message}
          </div>
        )}

        {/* Paramètres */}
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              ⚙️ Paramètres de la page d&apos;accueil
            </h2>

            <form onSubmit={handleSaveSettings} className="space-y-6 max-w-2xl">
              <div className="space-y-4">
                <Input
                  label="Titre principal"
                  placeholder="Les créations en laine de maman 🧶"
                  value={settings.title}
                  onChange={(e) => setSettings((s) => ({ ...s, title: e.target.value }))}
                />

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Sous-titre</label>
                  <Textarea
                    placeholder="Clique sur une création pour voir toutes les photos."
                    value={settings.subtitle}
                    onChange={(e) => setSettings((s) => ({ ...s, subtitle: e.target.value }))}
                    rows={3}
                  />
                </div>

                <Button type="submit" disabled={savingSettings}>
                  {savingSettings ? "⏳ Enregistrement..." : "💾 Enregistrer"}
                </Button>
              </div>
            </form>

            <div className="border-t border-slate-200 mt-6 pt-6">
              <h3 className="text-base font-semibold text-slate-900 mb-4">🎨 Couleurs disponibles</h3>
              <div className="mb-4 flex gap-2">
                  <Input
                    placeholder="Ajouter une couleur"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    onKeyPress={async (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const trimmed = newColor.trim().toLowerCase();
                        if (trimmed && !settings.colors.includes(trimmed)) {
                          const newColors = [...settings.colors, trimmed];
                          setSettings(s => ({ ...s, colors: newColors }));
                          setNewColor("");
                          // Sauvegarder immédiatement
                          await fetch("/api/settings", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ ...settings, colors: newColors }),
                          });
                        }
                      }
                    }}
                  />
                  <Button 
                    type="button"
                    variant="secondary"
                    onClick={async () => {
                      const trimmed = newColor.trim().toLowerCase();
                      if (trimmed && !settings.colors.includes(trimmed)) {
                        const newColors = [...settings.colors, trimmed];
                        setSettings(s => ({ ...s, colors: newColors }));
                        setNewColor("");
                        // Sauvegarder immédiatement
                        await fetch("/api/settings", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ ...settings, colors: newColors }),
                        });
                      }
                    }}
                  >
                    + Ajouter
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mb-6">
                  {settings.colors.map((color) => (
                    <div
                      key={color}
                      className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm"
                    >
                      <span>{color.charAt(0).toUpperCase() + color.slice(1)}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          const newColors = settings.colors.filter(c => c !== color);
                          setSettings(s => ({ ...s, colors: newColors }));
                          // Sauvegarder immédiatement
                          await fetch("/api/settings", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ ...settings, colors: newColors }),
                          });
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>

            <div className="border-t border-slate-200 pt-6">
              <h3 className="text-base font-semibold text-slate-900 mb-4">📦 Types d&apos;articles</h3>
              <div className="mb-4 flex gap-2">
                <Input
                  placeholder="Ajouter un type"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  onKeyPress={async (e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const trimmed = newType.trim().toLowerCase();
                      if (trimmed && !settings.types.includes(trimmed)) {
                        const newTypes = [...settings.types, trimmed];
                        setSettings(s => ({ ...s, types: newTypes }));
                        setNewType("");
                        // Sauvegarder immédiatement
                        await fetch("/api/settings", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ ...settings, types: newTypes }),
                        });
                      }
                    }
                  }}
                />
                <Button 
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    const trimmed = newType.trim().toLowerCase();
                    if (trimmed && !settings.types.includes(trimmed)) {
                      const newTypes = [...settings.types, trimmed];
                      setSettings(s => ({ ...s, types: newTypes }));
                      setNewType("");
                      // Sauvegarder immédiatement
                      await fetch("/api/settings", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ...settings, types: newTypes }),
                      });
                    }
                  }}
                >
                  + Ajouter
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {settings.types.map((type) => (
                  <div
                    key={type}
                    className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm"
                  >
                    <span>{type.charAt(0).toUpperCase() + type.slice(1)}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        const newTypes = settings.types.filter(t => t !== type);
                        setSettings(s => ({ ...s, types: newTypes }));
                        // Sauvegarder immédiatement
                        await fetch("/api/settings", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ ...settings, types: newTypes }),
                        });
                      }}
                      className="text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-600">Chargement...</div>
      </main>
    }>
      <AdminContent />
    </Suspense>
  );
}
