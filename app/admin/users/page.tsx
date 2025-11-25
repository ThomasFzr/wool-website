"use client";

import Link from "next/link";
import { FormEvent, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button, Input, Card, Badge } from "@/components";

type User = {
  _id: string;
  name?: string | null;
  email: string;
  role: "user" | "admin";
  provider: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  emailNotifications?: boolean;
  createdAt?: string;
};

export default function AdminUsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "user" as "user" | "admin",
    password: "",
    phone: "",
    address: "",
    city: "",
    postalCode: "",
    emailNotifications: true,
  });

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated" || session?.user?.role !== "admin") {
      router.push("/");
    }
  }, [session, status, router]);

  useEffect(() => {
    if (session?.user?.role === "admin") {
      loadUsers();
    }
  }, [session]);

  async function loadUsers() {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Erreur de chargement");
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      console.error(err);
      setMessage("Erreur lors du chargement des utilisateurs.");
    } finally {
      setLoading(false);
    }
  }

  function handleCreate() {
    setEditingUser(null);
    setForm({ 
      name: "", 
      email: "", 
      role: "user", 
      password: "",
      phone: "",
      address: "",
      city: "",
      postalCode: "",
      emailNotifications: true,
    });
    setShowModal(true);
    setMessage(null);
  }

  function handleEdit(user: User) {
    setEditingUser(user);
    setForm({
      name: user.name || "",
      email: user.email,
      role: user.role,
      password: "",
      phone: user.phone || "",
      address: user.address || "",
      city: user.city || "",
      postalCode: user.postalCode || "",
      emailNotifications: user.emailNotifications ?? true,
    });
    setShowModal(true);
    setMessage(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    try {
      const payload = {
        name: form.name || null,
        email: form.email,
        role: form.role,
        password: form.password || undefined,
        phone: form.phone || null,
        address: form.address || null,
        city: form.city || null,
        postalCode: form.postalCode || null,
        emailNotifications: form.emailNotifications,
      };

      const url = editingUser
        ? `/api/admin/users/${editingUser._id}`
        : "/api/admin/users";
      const method = editingUser ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        setMessage(errorData.error || "Erreur lors de l'enregistrement.");
        return;
      }

      setMessage(
        editingUser ? "Utilisateur mis à jour ✔️" : "Utilisateur créé ✔️"
      );
      setTimeout(() => setMessage(null), 3000);

      setShowModal(false);
      setForm({ 
        name: "", 
        email: "", 
        role: "user", 
        password: "",
        phone: "",
        address: "",
        city: "",
        postalCode: "",
        emailNotifications: true,
      });
      setEditingUser(null);
      loadUsers();
    } catch (err) {
      console.error(err);
      setMessage("Erreur serveur.");
    }
  }

  async function handleDelete(user: User) {
    const ok = confirm(
      `Êtes-vous sûr de vouloir supprimer l'utilisateur "${user.email}" ?`
    );
    if (!ok) return;

    try {
      const res = await fetch(`/api/admin/users/${user._id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.error || "Erreur lors de la suppression.");
        return;
      }

      setMessage("Utilisateur supprimé ✔️");
      setTimeout(() => setMessage(null), 3000);
      loadUsers();
    } catch (err) {
      console.error(err);
      alert("Erreur serveur.");
    }
  }

  function closeModal() {
    setShowModal(false);
    setEditingUser(null);
    setForm({ 
      name: "", 
      email: "", 
      role: "user", 
      password: "",
      phone: "",
      address: "",
      city: "",
      postalCode: "",
      emailNotifications: true,
    });
    setMessage(null);
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
        <div className="mb-6">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-2"
          >
            ← Retour à l&apos;administration
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            👥 Gestion des utilisateurs
          </h1>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`mb-4 rounded-lg p-3 text-sm ${
              message.includes("✔️")
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {message}
          </div>
        )}

        {/* Liste des utilisateurs */}
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              Utilisateurs ({users.length})
            </h2>
          </div>

          {loading && (
            <p className="text-sm text-slate-500">Chargement...</p>
          )}

          {!loading && users.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">
              Aucun utilisateur trouvé.
            </p>
          )}

          <div className="space-y-2">
            {users.map((user) => (
              <div
                key={user._id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-slate-900">
                      {user.name || "Sans nom"}
                    </span>
                    <Badge
                      variant={user.role === "admin" ? "danger" : "default"}
                    >
                      {user.role || "user"}
                    </Badge>
                    {user.provider && (
                      <Badge variant="default">{user.provider}</Badge>
                    )}
                    {user.emailNotifications === false && (
                      <Badge variant="default">🔕 Notifs off</Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-600">{user.email}</p>
                  {(user.phone || user.city) && (
                    <p className="text-xs text-slate-500">
                      {user.phone && `📞 ${user.phone}`}
                      {user.phone && user.city && " • "}
                      {user.city && `📍 ${user.city}`}
                    </p>
                  )}
                  {user.createdAt && (
                    <p className="text-xs text-slate-500 mt-1">
                      Créé le{" "}
                      {new Date(user.createdAt).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 sm:shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleEdit(user)}
                  >
                    ✏️ Modifier
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(user)}
                    disabled={session.user.email === user.email}
                  >
                    🗑️
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Modal de création/édition */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">
              {editingUser ? "✏️ Modifier l'utilisateur" : "➕ Créer un utilisateur"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Nom"
                placeholder="Jean Dupont"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />

              <Input
                label="Email *"
                type="email"
                placeholder="jean@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">
                  Rôle *
                </label>
                <select
                  value={form.role}
                  onChange={(e) =>
                    setForm({ ...form, role: e.target.value as "user" | "admin" })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                  required
                >
                  <option value="user">Utilisateur</option>
                  <option value="admin">Administrateur</option>
                </select>
              </div>

              {/* Ne pas afficher le champ mot de passe pour les utilisateurs SSO */}
              {(!editingUser || editingUser.provider === "credentials") && (
                <Input
                  label={editingUser ? "Nouveau mot de passe (laisser vide pour ne pas changer)" : "Mot de passe"}
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={!editingUser}
                />
              )}
              
              {editingUser && editingUser.provider !== "credentials" && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                  <p className="text-xs text-blue-800">
                    ℹ️ Cet utilisateur utilise <strong>{editingUser.provider}</strong> pour se connecter. Le mot de passe ne peut pas être modifié.
                  </p>
                </div>
              )}

              <Input
                label="Téléphone"
                type="tel"
                placeholder="06 12 34 56 78"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">
                  Adresse
                </label>
                <textarea
                  placeholder="12 rue de la Laine"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Ville"
                  placeholder="Paris"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />

                <Input
                  label="Code postal"
                  placeholder="75001"
                  value={form.postalCode}
                  onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.emailNotifications}
                  onChange={(e) => setForm({ ...form, emailNotifications: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
                />
                <span className="text-sm text-slate-700">
                  Notifications par email activées
                </span>
              </label>

              <div className="flex gap-2 pt-2">
                <Button type="submit">
                  {editingUser ? "💾 Mettre à jour" : "➕ Créer"}
                </Button>
                <Button type="button" variant="secondary" onClick={closeModal}>
                  Annuler
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </main>
  );
}
