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
    setForm({ name: "", email: "", role: "user", password: "" });
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
      setForm({ name: "", email: "", role: "user", password: "" });
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
    setForm({ name: "", email: "", role: "user", password: "" });
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
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
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

          <Button onClick={handleCreate}>➕ Créer un utilisateur</Button>
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
                      {user.role}
                    </Badge>
                    <Badge variant="default">{user.provider}</Badge>
                  </div>
                  <p className="text-sm text-slate-600">{user.email}</p>
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

              <Input
                label={editingUser ? "Nouveau mot de passe (laisser vide pour ne pas changer)" : "Mot de passe"}
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!editingUser}
              />

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
