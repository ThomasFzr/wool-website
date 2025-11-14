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
  price?: number;
};

export default function AdminPage() {
  const [form, setForm] = useState({
    title: "",
    description: "",
    imageUrl: "",
    price: "",
    password: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [creations, setCreations] = useState<Creation[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);

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

  useEffect(() => {
    loadCreations();
  }, []);

  async function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!CLOUD_NAME || !UPLOAD_PRESET) {
      alert(
        "Cloudinary n'est pas configuré (variables d'environnement manquantes)."
      );
      return;
    }

    try {
      setUploading(true);
      setMessage("Upload de l'image en cours...");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", UPLOAD_PRESET);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!res.ok) {
        throw new Error("Erreur Cloudinary");
      }

      const data = await res.json();

      setForm((f) => ({
        ...f,
        imageUrl: data.secure_url,
      }));

      setMessage("Image uploadée ✔️");
    } catch (err) {
      console.error(err);
      setMessage("Erreur lors de l'upload de l'image.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    const payload = {
      title: form.title,
      description: form.description || undefined,
      imageUrl: form.imageUrl || undefined,
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
        "x-admin-password": form.password,
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
      imageUrl: c.imageUrl ?? "",
      price: c.price != null ? String(c.price) : "",
    }));
    setMessage(null);
  }

  async function handleDelete(id: string) {
    if (!form.password) {
      alert("Entre d'abord le mot de passe admin.");
      return;
    }
    const ok = confirm("Supprimer cette création ?");
    if (!ok) return;

    const res = await fetch(`/api/creations/${id}`, {
      method: "DELETE",
      headers: {
        "x-admin-password": form.password,
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
    <main
      style={{
        minHeight: "100vh",
        padding: "2rem 1rem",
        background: "#edf2f7",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <Link href="/">← Retour à l'accueil</Link>
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            marginBottom: 16,
          }}
        >
          Admin – {editingId ? "Modifier une création" : "Ajouter une création"}
        </h1>

        {/* Formulaire */}
        <form
          onSubmit={handleSubmit}
          style={{
            background: "white",
            padding: 16,
            borderRadius: 16,
            boxShadow:
              "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <input
            type="password"
            placeholder="Mot de passe admin"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            style={{
              padding: 8,
              borderRadius: 8,
              border: "1px solid #cbd5e0",
            }}
          />

          <input
            placeholder="Titre"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            style={{
              padding: 8,
              borderRadius: 8,
              border: "1px solid #cbd5e0",
            }}
          />

          <textarea
            placeholder="Description"
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
            rows={3}
            style={{
              padding: 8,
              borderRadius: 8,
              border: "1px solid #cbd5e0",
            }}
          />

          {/* Upload de fichier */}
          <div
            style={{
              border: "1px dashed #cbd5e0",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <label
              style={{
                display: "block",
                fontSize: 14,
                marginBottom: 8,
                color: "#4a5568",
              }}
            >
              Image (upload depuis ton ordinateur)
            </label>
            <input type="file" accept="image/*" onChange={handleImageChange} />
            {uploading && (
              <p style={{ fontSize: 12, marginTop: 4 }}>
                Upload en cours...
              </p>
            )}
            {form.imageUrl && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 12, color: "#4a5568" }}>
                  Aperçu de l'image :
                </p>
                <img
                  src={form.imageUrl}
                  alt="Prévisualisation"
                  style={{
                    marginTop: 4,
                    maxHeight: 150,
                    borderRadius: 8,
                    objectFit: "cover",
                  }}
                />
              </div>
            )}
          </div>

          <input
            type="number"
            placeholder="Prix"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            style={{
              padding: 8,
              borderRadius: 8,
              border: "1px solid #cbd5e0",
            }}
          />

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="submit"
              disabled={uploading}
              style={{
                flex: "0 0 auto",
                padding: "10px 12px",
                borderRadius: 9999,
                border: "none",
                background: uploading ? "#4a5568" : "black",
                opacity: uploading ? 0.8 : 1,
                color: "white",
                fontWeight: 600,
                cursor: uploading ? "not-allowed" : "pointer",
              }}
            >
              {uploading
                ? "Attends, upload..."
                : editingId
                ? "Mettre à jour"
                : "Enregistrer"}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                style={{
                  padding: "10px 12px",
                  borderRadius: 9999,
                  border: "1px solid #cbd5e0",
                  background: "white",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Annuler
              </button>
            )}
          </div>

          {message && (
            <p style={{ marginTop: 8, fontSize: 14 }}>{message}</p>
          )}
        </form>

        {/* Liste des créations */}
        <section>
          <h2
            style={{
              fontSize: "1.1rem",
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Créations existantes
          </h2>
          {loadingList && <p>Chargement...</p>}
          {!loadingList && creations.length === 0 && (
            <p>Aucune création pour l'instant.</p>
          )}

          <div
            style={{
              display: "grid",
              gap: 12,
            }}
          >
            {creations.map((c) => (
              <div
                key={c._id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "white",
                  padding: 12,
                  borderRadius: 12,
                  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {c.imageUrl && (
                    <img
                      src={c.imageUrl}
                      alt={c.title}
                      style={{
                        width: 60,
                        height: 60,
                        borderRadius: 8,
                        objectFit: "cover",
                      }}
                    />
                  )}
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <strong>{c.title}</strong>
                      {c.price != null && (
                        <span
                          style={{
                            fontSize: 12,
                            background: "#edf2f7",
                            padding: "2px 6px",
                            borderRadius: 8,
                          }}
                        >
                          {c.price} €
                        </span>
                      )}
                    </div>
                    {c.description && (
                      <p style={{ fontSize: 12, color: "#4a5568" }}>
                        {c.description}
                      </p>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => handleEditClick(c)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 9999,
                      border: "1px solid #cbd5e0",
                      background: "white",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(c._id)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 9999,
                      border: "none",
                      background: "#e53e3e",
                      color: "white",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}