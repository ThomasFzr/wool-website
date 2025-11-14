"use client";

import Link from "next/link";
import { FormEvent, useState, ChangeEvent } from "react";

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

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

    async function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!CLOUD_NAME || !UPLOAD_PRESET) {
            alert("Cloudinary n'est pas configuré (variables d'environnement manquantes).");
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

        const res = await fetch("/api/creations", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-admin-password": form.password,
            },
            body: JSON.stringify({
                title: form.title,
                description: form.description || undefined,
                imageUrl: form.imageUrl,
                price: Number(form.price),
            }),
        });

        if (!res.ok) {
            setMessage("Erreur ou mot de passe incorrect.");
            return;
        }

        setMessage("Création ajoutée ✔");
        setForm((f) => ({
            ...f,
            title: "",
            description: "",
            imageUrl: "",
            price: "",
        }));
    }

    return (
        <main
            style={{
                minHeight: "100vh",
                padding: "2rem 1rem",
                background: "#edf2f7",
                fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
            }}
        >
            <div style={{ maxWidth: 600, margin: "0 auto" }}>
                <Link href="/">← Retour à l'accueil</Link>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 16 }}>
                    Admin – Ajouter une création
                </h1>

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
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                        />
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

                    <button
                        type="submit"
                        disabled={uploading}
                        style={{
                            marginTop: 8,
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
                        {uploading ? "Attends, upload..." : "Enregistrer"}
                    </button>

                    {message && (
                        <p style={{ marginTop: 8, fontSize: 14 }}>{message}</p>
                    )}
                </form>
            </div>
        </main>
    );
}