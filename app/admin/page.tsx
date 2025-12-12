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
    types: [] as string[],
    shippingCost: 5,
    pickupConditions: {
      enabled: false,
      minimumAmount: 0,
      allowedPostalCodes: [] as string[],
      message: "",
    }
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [pendingReservations, setPendingReservations] = useState(0);
  const [newMessages, setNewMessages] = useState(0);
  const [newColor, setNewColor] = useState("");
  const [newType, setNewType] = useState("");
  const [newPostalCode, setNewPostalCode] = useState("");

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
          shippingCost: s.shippingCost ?? 5,
          pickupConditions: s.pickupConditions ?? {
            enabled: false,
            minimumAmount: 0,
            allowedPostalCodes: [],
            message: "",
          },
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
      // Afficher le nombre de nouvelles commandes non vues
      setPendingReservations(data.new || 0);
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
        shippingCost: savedData.shippingCost ?? settings.shippingCost,
        pickupConditions: savedData.pickupConditions ?? settings.pickupConditions,
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

  async function saveColorsAndTypes(updatedSettings?: typeof settings) {
    try {
      const settingsToSave = updatedSettings || settings;
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsToSave),
      });
      if (!res.ok) {
        console.error("Erreur lors de la sauvegarde");
      } else {
        // Recharger les settings pour avoir les valeurs à jour
        const savedData = await res.json();
        setSettings({
          title: savedData.title ?? settingsToSave.title,
          subtitle: savedData.subtitle ?? settingsToSave.subtitle,
          colors: savedData.colors ?? settingsToSave.colors,
          types: savedData.types ?? settingsToSave.types,
          shippingCost: savedData.shippingCost ?? settingsToSave.shippingCost,
          pickupConditions: savedData.pickupConditions ?? settingsToSave.pickupConditions,
        });
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
              <span>📋 Commandes</span>
              {pendingReservations > 0 && (
                <span className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-blue-500 text-white text-[10px] font-semibold animate-pulse">
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

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">💰 Frais de livraison (en euros)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="5.00"
                    value={settings.shippingCost.toString()}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value) && value >= 0) {
                        setSettings((s) => ({ ...s, shippingCost: value }));
                      } else if (e.target.value === "") {
                        setSettings((s) => ({ ...s, shippingCost: 0 }));
                      }
                    }}
                  />
                  <p className="text-xs text-slate-500">
                    Montant des frais de port affiché sur Stripe et dans le panier
                  </p>
                </div>

                {/* Conditions pour la remise en main propre */}
                <div className="border-t border-slate-200 pt-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="pickupConditionsEnabled"
                      checked={settings.pickupConditions.enabled}
                      onChange={(e) => {
                        setSettings((s) => ({
                          ...s,
                          pickupConditions: {
                            ...s.pickupConditions,
                            enabled: e.target.checked,
                          },
                        }));
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                    />
                    <label htmlFor="pickupConditionsEnabled" className="text-sm font-medium text-slate-900">
                      Activer les conditions pour la remise en main propre
                    </label>
                  </div>

                  {settings.pickupConditions.enabled && (
                    <div className="space-y-4 pl-6 border-l-2 border-slate-200">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-700">
                          Montant minimum (en euros)
                        </label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={settings.pickupConditions.minimumAmount.toString()}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value);
                            if (!isNaN(value) && value >= 0) {
                              setSettings((s) => ({
                                ...s,
                                pickupConditions: {
                                  ...s.pickupConditions,
                                  minimumAmount: value,
                                },
                              }));
                            } else if (e.target.value === "") {
                              setSettings((s) => ({
                                ...s,
                                pickupConditions: {
                                  ...s.pickupConditions,
                                  minimumAmount: 0,
                                },
                              }));
                            }
                          }}
                        />
                        <p className="text-xs text-slate-500">
                          Montant minimum requis pour choisir la remise en main propre (0 = pas de minimum)
                        </p>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-700">
                          Codes postaux autorisés (optionnel)
                        </label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Ex: 75001"
                            value={newPostalCode}
                            onChange={(e) => setNewPostalCode(e.target.value)}
                            onKeyPress={async (e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const trimmed = newPostalCode.trim();
                                if (trimmed && !settings.pickupConditions.allowedPostalCodes.includes(trimmed)) {
                                  const newCodes = [...settings.pickupConditions.allowedPostalCodes, trimmed];
                                  const updatedSettings = {
                                    ...settings,
                                    pickupConditions: {
                                      ...settings.pickupConditions,
                                      allowedPostalCodes: newCodes,
                                    },
                                  };
                                  setSettings(updatedSettings);
                                  setNewPostalCode("");
                                  await saveColorsAndTypes(updatedSettings);
                                }
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={async () => {
                              const trimmed = newPostalCode.trim();
                              if (trimmed && !settings.pickupConditions.allowedPostalCodes.includes(trimmed)) {
                                const newCodes = [...settings.pickupConditions.allowedPostalCodes, trimmed];
                                const updatedSettings = {
                                  ...settings,
                                  pickupConditions: {
                                    ...settings.pickupConditions,
                                    allowedPostalCodes: newCodes,
                                  },
                                };
                                setSettings(updatedSettings);
                                setNewPostalCode("");
                                await saveColorsAndTypes(updatedSettings);
                              }
                            }}
                            className="cursor-pointer"
                          >
                            + Ajouter
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {settings.pickupConditions.allowedPostalCodes.map((code) => (
                            <div
                              key={code}
                              className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm"
                            >
                              <span>{code}</span>
                              <button
                                type="button"
                                onClick={async () => {
                                  const newCodes = settings.pickupConditions.allowedPostalCodes.filter(
                                    (c) => c !== code
                                  );
                                  const updatedSettings = {
                                    ...settings,
                                    pickupConditions: {
                                      ...settings.pickupConditions,
                                      allowedPostalCodes: newCodes,
                                    },
                                  };
                                  setSettings(updatedSettings);
                                  await saveColorsAndTypes(updatedSettings);
                                }}
                                className="text-red-500 hover:text-red-700 cursor-pointer"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-slate-500">
                          Laissez vide pour autoriser tous les codes postaux. Si des codes sont spécifiés, seuls ces codes postaux pourront choisir la remise en main propre.
                        </p>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-700">
                          Message informatif (optionnel)
                        </label>
                        <Textarea
                          placeholder="Ex: Retrait disponible sur rendez-vous uniquement"
                          value={settings.pickupConditions.message}
                          onChange={(e) => {
                            setSettings((s) => ({
                              ...s,
                              pickupConditions: {
                                ...s.pickupConditions,
                                message: e.target.value,
                              },
                            }));
                          }}
                          rows={2}
                        />
                        <p className="text-xs text-slate-500">
                          Message affiché sous l'option "Remise en main propre" dans le panier
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <Button type="submit" disabled={savingSettings} className="cursor-pointer">
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
                    className="cursor-pointer"
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
                          if (confirm(`Supprimer la couleur "${color}" ?`)) {
                            const newColors = settings.colors.filter(c => c !== color);
                            setSettings(s => ({ ...s, colors: newColors }));
                            // Sauvegarder immédiatement
                            await fetch("/api/settings", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ ...settings, colors: newColors }),
                            });
                          }
                        }}
                        className="text-red-500 hover:text-red-700 cursor-pointer"
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
                  className="cursor-pointer"
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
                        if (confirm(`Supprimer le type "${type}" ?`)) {
                          const newTypes = settings.types.filter(t => t !== type);
                          setSettings(s => ({ ...s, types: newTypes }));
                          // Sauvegarder immédiatement
                          await fetch("/api/settings", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ ...settings, types: newTypes }),
                          });
                        }
                      }}
                      className="text-red-500 hover:text-red-700 cursor-pointer"
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
