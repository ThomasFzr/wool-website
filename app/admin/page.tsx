"use client";

import Link from "next/link";
import {
  FormEvent,
  useState,
  ChangeEvent,
  useEffect,
} from "react";

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

type Creation = {
  _id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  images?: string[];
  price?: number;
};

export default function AdminPage() {
  // Auth
  const [adminPassword, setAdminPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");

  // Formulaire d’édition / création
  const [form, setForm] = useState({
    title: "",
    description: "",
    imageUrl: "",
    images: [] as string[],
    price: "",
  });

  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Liste des créations
  const [creations, setCreations] = useState<Creation[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);

  // Auto-login si un mdp est déjà en localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("adminPassword");
    if (!saved) return;

    (async () => {
      const ok = await tryLogin(saved, false);
      if (ok) {
        setAdminPassword(saved);
        setIsLoggedIn(true);
      }
    })();
  }, []);

  // Charger les créations uniquement si connecté
  useEffect(() => {
    if (isLoggedIn) {
      loadCreations();
    }
  }, [isLoggedIn]);

  async function loadCreations() {
    try {
      setLoadingList(true);
      const res = await fetch("/api/creations");
      const data = await res.json();
      setCreations(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingList(false);
    }
  }

  async function tryLogin(password: string, showErrors = true) {
    try {
      const res = await fetch("/api/admin-login", {
        method: "POST",
        headers: {
          "x-admin-password": password,
        },
      });

      if (!res.ok) {
        if (showErrors) {
          setMessage("Mot de passe incorrect.");
        }
        return false;
      }
      return true;
    } catch (err) {
      console.error(err);
      if (showErrors) {
        setMessage("Erreur réseau pendant le login.");
      }
      return false;
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    const ok = await tryLogin(loginPassword, true);
    if (!ok) return;

    setAdminPassword(loginPassword);
    setIsLoggedIn(true);

    if (typeof window !== "undefined") {
      window.localStorage.setItem("adminPassword", loginPassword);
    }

    setLoginPassword("");
    setMessage("Connecté ✔️");
  }

  function handleLogout() {
    setIsLoggedIn(false);
    setAdminPassword("");
    setEditingId(null);
    setForm({
      title: "",
      description: "",
      imageUrl: "",
      images: [],
      price: "",
    });
    setMessage("Déconnecté.");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("adminPassword");
    }
  }

  async function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!CLOUD_NAME || !UPLOAD_PRESET) {
      alert("Cloudinary n'est pas configuré.");
      return;
    }

    try {
      setUploading(true);
      setMessage("Upload des images en cours...");

      const uploadedUrls: string[] = [];

      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", UPLOAD_PRESET);

        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
          { method: "POST", body: formData }
        );

        if (!res.ok) {
          throw new Error("Erreur Cloudinary");
        }

        const data = await res.json();
        uploadedUrls.push(data.secure_url);
      }

      setForm((f) => ({
        ...f,
        images: [...f.images, ...uploadedUrls], // 👈 on ajoute
      }));

      setMessage("Images uploadées ✔️");
    } catch (err) {
      console.error(err);
      setMessage("Erreur lors de l'upload des images.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!adminPassword) {
      setMessage("Tu n'es pas connecté.");
      return;
    }

    const payload = {
      title: form.title,
      description: form.description || undefined,
      imageUrl: form.images[0] || undefined,
      images: form.images, 
      price: form.price ? Number(form.price) : undefined,
    };

    const url = editingId
      ? `/api/creations/${editingId}`
      : "/api/creations";
    const method = editingId ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": adminPassword,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      setMessage("Erreur ou mot de passe incorrect.");
      return;
    }

    setMessage(editingId ? "Création mise à jour ✔️" : "Création ajoutée ✔️");
    setForm((f) => ({
      ...f,
      title: "",
      description: "",
      imageUrl: "",
      price: "",
    }));
    setEditingId(null);
    loadCreations();
  }

  function handleEditClick(c: Creation) {
    setEditingId(c._id);
    setForm((f) => ({
      ...f,
      title: c.title ?? "",
      description: c.description ?? "",
      images: c.images ?? (c.imageUrl ? [c.imageUrl] : []),
      price: c.price != null ? String(c.price) : "",
    }));
    setMessage(null);
  }

  async function handleDelete(id: string) {
    if (!adminPassword) {
      alert("Tu n'es pas connecté.");
      return;
    }
    const ok = confirm("Supprimer cette création ?");
    if (!ok) return;

    const res = await fetch(`/api/creations/${id}`, {
      method: "DELETE",
      headers: {
        "x-admin-password": adminPassword,
      },
    });

    if (!res.ok) {
      alert("Erreur ou mot de passe incorrect.");
      return;
    }

    if (editingId === id) {
      setEditingId(null);
      setForm((f) => ({
        ...f,
        title: "",
        description: "",
        imageUrl: "",
        price: "",
      }));
    }

    loadCreations();
  }

  function handleCancelEdit() {
    setEditingId(null);
    setForm((f) => ({
      ...f,
      title: "",
      description: "",
      imageUrl: "",
      price: "",
    }));
    setMessage(null);
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href="/"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Retour à l&apos;accueil
          </Link>
        </div>

        {/* Si pas connecté : écran de login */}
        {!isLoggedIn && (
          <div className="mx-auto mt-8 max-w-md">
            <h1 className="mb-4 text-2xl font-semibold tracking-tight">
              Admin – Connexion
            </h1>
            <form
              onSubmit={handleLogin}
              className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100"
            >
              <input
                type="password"
                placeholder="Mot de passe admin"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
              />
              <button
                type="submit"
                className="w-full rounded-full bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition"
              >
                Se connecter
              </button>
              {message && (
                <p className="text-sm text-slate-600">{message}</p>
              )}
            </form>
          </div>
        )}

        {/* Si connecté : interface admin */}
        {isLoggedIn && (
          <>
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-2xl font-semibold tracking-tight">
                Admin – {editingId ? "Modifier une création" : "Ajouter une création"}
              </h1>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Se déconnecter
              </button>
            </div>

            {/* Formulaire */}
            <form
              onSubmit={handleSubmit}
              className="mb-8 space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700">
                      Titre
                    </label>
                    <input
                      placeholder="Ex : Snood rose poudré"
                      value={form.title}
                      onChange={(e) =>
                        setForm({ ...form, title: e.target.value })
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700">
                      Description
                    </label>
                    <textarea
                      placeholder="Détails, matière, pour qui..."
                      value={form.description}
                      onChange={(e) =>
                        setForm({ ...form, description: e.target.value })
                      }
                      rows={4}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700">
                      Prix (en euros)
                    </label>
                    <input
                      type="number"
                      placeholder="Ex : 25"
                      value={form.price}
                      onChange={(e) =>
                        setForm({ ...form, price: e.target.value })
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700">
                      Image (upload depuis ton ordinateur)
                    </label>
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 text-xs text-slate-600">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageChange}
                        className="block w-full text-xs text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-800"
                      />
                      {uploading && (
                        <p className="mt-2 text-xs text-slate-500">
                          Upload en cours...
                        </p>
                      )}
                      {form.images.length > 0 && (
                        <div className="mt-3 space-y-1">
                          <p className="text-xs text-slate-500">
                            Aperçu des images :
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {form.images.map((url, i) => (
                              <div key={i} className="relative">
                                <img
                                  src={url}
                                  alt={`Prévisualisation ${i + 1}`}
                                  className="h-20 w-20 rounded-lg object-cover"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={uploading}
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {uploading
                    ? "Upload en cours..."
                    : editingId
                      ? "Mettre à jour"
                      : "Enregistrer"}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Annuler
                  </button>
                )}
              </div>

              {message && (
                <p className="text-sm text-slate-600">{message}</p>
              )}
            </form>

            {/* Liste des créations */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-800">
                Créations existantes
              </h2>
              {loadingList && (
                <p className="text-sm text-slate-500">Chargement...</p>
              )}
              {!loadingList && creations.length === 0 && (
                <p className="text-sm text-slate-500">
                  Aucune création pour l&apos;instant.
                </p>
              )}

              <div className="space-y-3">
                {creations.map((c) => (
                  <div
                    key={c._id}
                    className="flex items-center justify-between gap-4 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100"
                  >
                    <div className="flex items-center gap-3">
                      {c.imageUrl && (
                        <img
                          src={c.imageUrl}
                          alt={c.title}
                          className="h-14 w-14 rounded-lg object-cover"
                        />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {c.title}
                          </span>
                          {c.price != null && (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                              {c.price} €
                            </span>
                          )}
                        </div>
                        {c.description && (
                          <p className="text-xs text-slate-600 line-clamp-2">
                            {c.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleEditClick(c)}
                        className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c._id)}
                        className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}