"use client";

import { useState, FormEvent, ChangeEvent } from "react";
import { signIn } from "next-auth/react";
import { Button, Input, Card } from "@/components";

type ProfileFormData = {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
};

type UserProfile = {
  name?: string | null;
  email: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  emailNotifications: boolean;
  provider: string;
};

type ProfileFormProps = {
  user: UserProfile;
  onUpdate: () => void;
};

export function ProfileForm({ user, onUpdate }: ProfileFormProps) {
  const [form, setForm] = useState<ProfileFormData>({
    name: user.name || "",
    email: user.email,
    phone: user.phone || "",
    address: user.address || "",
    city: user.city || "",
    postalCode: user.postalCode || "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [emailNotifications, setEmailNotifications] = useState(
    user.emailNotifications
  );
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"profile" | "password" | "preferences">("profile");

  const isCredentialsProvider = user.provider === "credentials";

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          address: form.address,
          city: form.city,
          postalCode: form.postalCode,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        setMessage(error.error || "Erreur lors de la mise à jour");
        return;
      }

      setMessage("Profil mis à jour ✔️");
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setMessage("Erreur serveur");
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    if (form.newPassword !== form.confirmPassword) {
      setMessage("Les mots de passe ne correspondent pas");
      setSaving(false);
      return;
    }

    if (form.newPassword && form.newPassword.length < 6) {
      setMessage("Le mot de passe doit contenir au moins 6 caractères");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        setMessage(error.error || "Erreur lors de la mise à jour");
        return;
      }

      // Le changement révoque les sessions ouvertes avant, y compris celle-ci : on se
      // reconnecte avec le nouveau mot de passe pour rester connecté.
      await signIn("credentials", {
        email: user.email,
        password: form.newPassword,
        redirect: false,
      });

      setMessage("Mot de passe mis à jour ✔️");
      setForm({ ...form, currentPassword: "", newPassword: "", confirmPassword: "" });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setMessage("Erreur serveur");
    } finally {
      setSaving(false);
    }
  }

  async function handlePreferencesSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/account/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailNotifications,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        setMessage(error.error || "Erreur lors de la mise à jour");
        return;
      }

      setMessage("Préférences mises à jour ✔️");
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setMessage("Erreur serveur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Message */}
      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.includes("✔️")
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 sm:gap-2 border-b border-slate-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab("profile")}
          className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === "profile"
              ? "border-b-2 border-slate-900 text-slate-900"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          👤 Profil
        </button>
        {isCredentialsProvider && (
          <button
            onClick={() => setActiveTab("password")}
            className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === "password"
                ? "border-b-2 border-slate-900 text-slate-900"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            🔒 Mot de passe
          </button>
        )}
        <button
          onClick={() => setActiveTab("preferences")}
          className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === "preferences"
              ? "border-b-2 border-slate-900 text-slate-900"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          ⚙️ Préférences
        </button>
      </div>

      {/* Tab Content: Profile */}
      {activeTab === "profile" && (
        <Card className="p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 mb-4">
            Informations personnelles
          </h2>

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <Input
              label="Nom complet"
              placeholder="Jean Dupont"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <Input
              label="Email"
              type="email"
              value={form.email}
              disabled
              className="bg-slate-50 cursor-not-allowed"
            />
            <p className="text-xs text-slate-500 -mt-2">
              L'email ne peut pas être modifié
            </p>

            <Input
              label="Téléphone"
              type="tel"
              placeholder="06 12 34 56 78"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">
                Adresse de livraison
              </label>
              <textarea
                placeholder="12 rue de la Maille"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Ville"
                placeholder="Lyon"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />

              <Input
                label="Code postal"
                placeholder="69000"
                value={form.postalCode}
                onChange={(e) =>
                  setForm({ ...form, postalCode: e.target.value })
                }
              />
            </div>

            <Button type="submit" disabled={saving} className="w-full sm:w-auto cursor-pointer">
              {saving ? "⏳ Enregistrement..." : "💾 Enregistrer"}
            </Button>
          </form>
        </Card>
      )}

      {/* Tab Content: Password */}
      {activeTab === "password" && isCredentialsProvider && (
        <Card className="p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 mb-4">
            Changer le mot de passe
          </h2>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <Input
              label="Mot de passe actuel"
              type="password"
              placeholder="••••••••"
              value={form.currentPassword}
              onChange={(e) =>
                setForm({ ...form, currentPassword: e.target.value })
              }
              required
            />

            <Input
              label="Nouveau mot de passe"
              type="password"
              placeholder="••••••••"
              value={form.newPassword}
              onChange={(e) =>
                setForm({ ...form, newPassword: e.target.value })
              }
              required
            />

            <Input
              label="Confirmer le nouveau mot de passe"
              type="password"
              placeholder="••••••••"
              value={form.confirmPassword}
              onChange={(e) =>
                setForm({ ...form, confirmPassword: e.target.value })
              }
              required
            />

            <Button type="submit" disabled={saving} className="w-full sm:w-auto cursor-pointer">
              {saving ? "⏳ Mise à jour..." : "🔒 Changer le mot de passe"}
            </Button>
          </form>
        </Card>
      )}

      {/* Tab Content: Preferences */}
      {activeTab === "preferences" && (
        <Card className="p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 mb-4">
            Préférences de notification
          </h2>

          <form onSubmit={handlePreferencesSubmit} className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={emailNotifications}
                onChange={(e) => setEmailNotifications(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300 cursor-pointer"
              />
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Notifications par email
                </p>
                <p className="text-xs text-slate-600">
                  Recevez des emails pour les nouvelles créations, les mises à
                  jour de vos réservations et les offres spéciales
                </p>
              </div>
            </label>

            <Button type="submit" disabled={saving} className="w-full sm:w-auto cursor-pointer">
              {saving ? "⏳ Enregistrement..." : "💾 Enregistrer"}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
