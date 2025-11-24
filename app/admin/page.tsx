"use client";

import Link from "next/link";
import { FormEvent, useState, ChangeEvent, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button, Input, Textarea, Card, Badge } from "@/components";

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

type Creation = {
  _id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  images?: string[];
  imagePublicIds?: string[];
  price?: number;
  color?: string;
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [form, setForm] = useState({
    title: "",
    description: "",
    imageUrl: "",
    images: [] as string[],
    imagePublicIds: [] as string[],
    price: "",
    color: "",
  });

  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [creations, setCreations] = useState<Creation[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [touchStartIndex, setTouchStartIndex] = useState<number | null>(null);
  const [settings, setSettings] = useState({ title: "", subtitle: "" });
  const [savingSettings, setSavingSettings] = useState(false);
  const [pendingReservations, setPendingReservations] = useState(0);
  const [activeTab, setActiveTab] = useState<"creations" | "settings">("creations");
  
  const formRef = useRef<HTMLDivElement>(null);

  const colorOptions = Array.from(
    new Set(
      creations
        .map((c) => c.color?.trim())
        .filter((c): c is string => Boolean(c))
    )
  ).sort((a, b) => {
    if (a.toLowerCase() === "multicolore") return 1;
    if (b.toLowerCase() === "multicolore") return -1;
    return a.localeCompare(b);
  });

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (!res.ok) return;
        const s = await res.json();
        setSettings({
          title: s.title ?? "Les créations en laine de maman 🧶",
          subtitle: s.subtitle ?? "Clique sur une création pour voir toutes les photos.",
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
      loadCreations();
      loadPendingReservations();
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

      setMessage("Paramètres enregistrés ✔️");
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setMessage("Erreur serveur lors de l'enregistrement.");
    } finally {
      setSavingSettings(false);
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
      const uploadedPublicIds: string[] = [];

      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", UPLOAD_PRESET);

        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
          { method: "POST", body: formData }
        );

        if (!res.ok) throw new Error("Erreur Cloudinary");

        const data = await res.json();
        uploadedUrls.push(data.secure_url);
        uploadedPublicIds.push(data.public_id);
      }

      setForm((f) => ({
        ...f,
        images: [...f.images, ...uploadedUrls],
        imagePublicIds: [...f.imagePublicIds, ...uploadedPublicIds],
      }));

      setMessage("Images uploadées ✔️");
      setTimeout(() => setMessage(null), 3000);
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

    const payload = {
      title: form.title,
      description: form.description || undefined,
      imageUrl: form.images[0] || undefined,
      images: form.images,
      imagePublicIds: form.imagePublicIds,
      price: form.price ? Number(form.price) : undefined,
      color: form.color || undefined,
    };

    const url = editingId ? `/api/creations/${editingId}` : "/api/creations";
    const method = editingId ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      setMessage("Erreur lors de l'enregistrement.");
      return;
    }

    setMessage(editingId ? "Création mise à jour ✔️" : "Création ajoutée ✔️");
    setTimeout(() => setMessage(null), 3000);
    
    setForm({
      title: "",
      description: "",
      imageUrl: "",
      images: [],
      imagePublicIds: [],
      price: "",
      color: "",
    });
    setEditingId(null);
    loadCreations();
  }

  function handleEditClick(c: Creation) {
    setEditingId(c._id);
    setForm({
      title: c.title ?? "",
      description: c.description ?? "",
      imageUrl: "",
      images: c.images ?? (c.imageUrl ? [c.imageUrl] : []),
      price: c.price != null ? String(c.price) : "",
      imagePublicIds: c.imagePublicIds ?? [],
      color: c.color ?? "",
    });
    setMessage(null);

    if (formRef.current) {
      const top = formRef.current.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top - 80, behavior: "smooth" });
    }
  }

  async function handleDelete(id: string) {
    const ok = confirm("Supprimer cette création ?");
    if (!ok) return;

    const res = await fetch(`/api/creations/${id}`, { method: "DELETE" });

    if (!res.ok) {
      alert("Erreur lors de la suppression.");
      return;
    }

    if (editingId === id) {
      setEditingId(null);
      setForm({
        title: "",
        description: "",
        imageUrl: "",
        images: [],
        imagePublicIds: [],
        price: "",
        color: "",
      });
    }

    loadCreations();
  }

  function handleCancelEdit() {
    setEditingId(null);
    setForm({
      title: "",
      description: "",
      imageUrl: "",
      images: [],
      imagePublicIds: [],
      price: "",
      color: "",
    });
    setMessage(null);
  }

  function removeImage(index: number) {
    setForm((f) => ({
      ...f,
      images: f.images.filter((_, i) => i !== index),
      imagePublicIds: f.imagePublicIds.filter((_, i) => i !== index),
    }));
  }

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, index: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;

    setForm((f) => {
      const imagesArr = [...f.images];
      const publicIdsArr = [...f.imagePublicIds];
      const [movedImage] = imagesArr.splice(dragIndex, 1);
      const [movedPublicId] = publicIdsArr.splice(dragIndex, 1);
      imagesArr.splice(index, 0, movedImage);
      publicIdsArr.splice(index, 0, movedPublicId);
      return { ...f, images: imagesArr, imagePublicIds: publicIdsArr };
    });

    setDragIndex(index);
  }

  function handleDragEnd() {
    setDragIndex(null);
  }

  function handleTouchStart(index: number) {
    setTouchStartIndex(index);
    setDragIndex(index);
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (touchStartIndex === null) return;
    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!element) return;

    const imageContainer = element.closest("[data-image-index]");
    if (!imageContainer) return;

    const targetIndex = Number(imageContainer.getAttribute("data-image-index"));

    if (targetIndex !== touchStartIndex && targetIndex >= 0) {
      setForm((f) => {
        const imagesArr = [...f.images];
        const publicIdsArr = [...f.imagePublicIds];
        const [movedImage] = imagesArr.splice(touchStartIndex, 1);
        const [movedPublicId] = publicIdsArr.splice(touchStartIndex, 1);
        imagesArr.splice(targetIndex, 0, movedImage);
        publicIdsArr.splice(targetIndex, 0, movedPublicId);
        return { ...f, images: imagesArr, imagePublicIds: publicIdsArr };
      });

      setTouchStartIndex(targetIndex);
      setDragIndex(targetIndex);
    }
  }

  function handleTouchEnd() {
    setTouchStartIndex(null);
    setDragIndex(null);
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

          <Link
            href="/admin/reservations"
            className="relative inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            onClick={loadPendingReservations}
          >
            <span>📋 Réservations</span>
            {pendingReservations > 0 && (
              <Badge variant="danger" className="bg-red-500 text-white">
                {pendingReservations}
              </Badge>
            )}
          </Link>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-2 border-b border-slate-200">
          <button
            onClick={() => setActiveTab("creations")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "creations"
                ? "border-b-2 border-slate-900 text-slate-900"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Créations
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "settings"
                ? "border-b-2 border-slate-900 text-slate-900"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Paramètres
          </button>
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

        {/* Tab Content: Créations */}
        {activeTab === "creations" && (
          <div className="space-y-6">
            {/* Formulaire de création/édition */}
            <Card className="p-6">
              <div ref={formRef}>
                <h2 className="text-lg font-semibold text-slate-900 mb-4">
                  {editingId ? "✏️ Modifier une création" : "➕ Ajouter une création"}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Colonne gauche */}
                    <div className="space-y-4">
                      <Input
                        label="Titre *"
                        placeholder="Ex : Snood rose poudré"
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        required
                      />

                      <Textarea
                        label="Description"
                        placeholder="Détails, matière, pour qui..."
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        rows={4}
                      />

                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          label="Prix (€)"
                          type="number"
                          placeholder="25"
                          value={form.price}
                          onChange={(e) => setForm({ ...form, price: e.target.value })}
                        />

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-slate-700">Couleur</label>
                          <input
                            list="color-options"
                            placeholder="Rose poudré..."
                            value={form.color}
                            onChange={(e) => setForm({ ...form, color: e.target.value })}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                          />
                          <datalist id="color-options">
                            {colorOptions.map((color) => (
                              <option key={color} value={color} />
                            ))}
                          </datalist>
                        </div>
                      </div>
                    </div>

                    {/* Colonne droite - Images */}
                    <div className="space-y-3">
                      <label className="text-xs font-medium text-slate-700">Images</label>
                      <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleImageChange}
                          className="hidden"
                          id="file-upload"
                          disabled={uploading}
                        />
                        <label
                          htmlFor="file-upload"
                          className={`block cursor-pointer ${uploading ? 'opacity-50' : ''}`}
                        >
                          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-slate-200">
                            📁
                          </div>
                          <p className="text-sm font-medium text-slate-700">
                            {uploading ? "Upload en cours..." : "Cliquez pour ajouter des images"}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            ou glissez-déposez vos fichiers
                          </p>
                        </label>
                      </div>

                      {form.images.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-slate-700">
                            {form.images.length} image{form.images.length > 1 ? "s" : ""} ajoutée{form.images.length > 1 ? "s" : ""}
                          </p>
                          <div className="grid grid-cols-4 gap-2">
                            {form.images.map((url, i) => (
                              <div
                                key={i}
                                data-image-index={i}
                                draggable
                                onDragStart={() => handleDragStart(i)}
                                onDragOver={(e) => handleDragOver(e, i)}
                                onDragEnd={handleDragEnd}
                                onTouchStart={() => handleTouchStart(i)}
                                onTouchMove={handleTouchMove}
                                onTouchEnd={handleTouchEnd}
                                className={`relative aspect-square cursor-move rounded-lg overflow-hidden ${
                                  dragIndex === i ? "ring-2 ring-blue-500" : "ring-1 ring-slate-200"
                                }`}
                                style={{ touchAction: "none" }}
                              >
                                <button
                                  onClick={() => removeImage(i)}
                                  type="button"
                                  className="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs hover:bg-red-600"
                                >
                                  ✕
                                </button>
                                {i === 0 && (
                                  <div className="absolute left-1 top-1 z-10 rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                    Couverture
                                  </div>
                                )}
                                <img
                                  src={url}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  draggable={false}
                                />
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-slate-500">
                            💡 Glissez les images pour les réordonner
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Boutons d'action */}
                  <div className="flex flex-wrap gap-2 pt-4 border-t">
                    <Button type="submit" disabled={uploading || !form.title}>
                      {uploading ? "⏳ Upload..." : editingId ? "💾 Mettre à jour" : "➕ Créer"}
                    </Button>

                    {editingId && (
                      <Button type="button" variant="secondary" onClick={handleCancelEdit}>
                        Annuler
                      </Button>
                    )}
                  </div>
                </form>
              </div>
            </Card>

            {/* Liste des créations */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                📦 Créations existantes ({creations.length})
              </h2>

              {loadingList && (
                <p className="text-sm text-slate-500">Chargement...</p>
              )}

              {!loadingList && creations.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-8">
                  Aucune création pour l&apos;instant. Créez-en une ci-dessus !
                </p>
              )}

              <div className="space-y-2">
                {creations.map((c) => (
                  <div
                    key={c._id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {c.imageUrl && (
                        <img
                          src={c.imageUrl}
                          alt={c.title}
                          className="h-16 w-16 shrink-0 rounded-lg object-cover"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-slate-900">
                            {c.title}
                          </span>
                          {c.price != null && (
                            <Badge variant="default">{c.price} €</Badge>
                          )}
                          {c.color && (
                            <Badge variant="default">{c.color}</Badge>
                          )}
                        </div>
                        {c.description && (
                          <p className="text-xs text-slate-600 line-clamp-2">
                            {c.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:shrink-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleEditClick(c)}
                      >
                        ✏️ Modifier
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(c._id)}
                      >
                        🗑️
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* Tab Content: Paramètres */}
        {activeTab === "settings" && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              ⚙️ Paramètres de la page d&apos;accueil
            </h2>

            <form onSubmit={handleSaveSettings} className="space-y-4 max-w-2xl">
              <Input
                label="Titre principal"
                placeholder="Les créations en laine de maman 🧶"
                value={settings.title}
                onChange={(e) => setSettings((s) => ({ ...s, title: e.target.value }))}
              />

              <Input
                label="Sous-titre"
                placeholder="Clique sur une création pour voir toutes les photos."
                value={settings.subtitle}
                onChange={(e) => setSettings((s) => ({ ...s, subtitle: e.target.value }))}
              />

              <Button type="submit" disabled={savingSettings}>
                {savingSettings ? "⏳ Enregistrement..." : "💾 Enregistrer"}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </main>
  );
}
