"use client";

import Link from "next/link";
import { FormEvent, useState, ChangeEvent, useEffect, useRef, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
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
  type?: string;
  showAsNew?: boolean;
  displayOrder?: number;
  reserved?: boolean;
  sold?: boolean;
};

function AdminCreationsContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [form, setForm] = useState({
    title: "",
    description: "",
    imageUrl: "",
    images: [] as string[],
    imagePublicIds: [] as string[],
    price: "",
    color: "",
    type: "" as string,
    showAsNew: true as boolean,
  });

  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [creations, setCreations] = useState<Creation[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [touchStartIndex, setTouchStartIndex] = useState<number | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [listDragIndex, setListDragIndex] = useState<number | null>(null);
  const [listTouchStartIndex, setListTouchStartIndex] = useState<number | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [availableColors, setAvailableColors] = useState<string[]>([]);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  
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
    if (status === "loading") return;
    if (status === "unauthenticated" || session?.user?.role !== "admin") {
      router.push("/");
    }
  }, [session, status, router]);

  useEffect(() => {
    if (session?.user?.role === "admin") {
      loadCreations();
      loadSettings();
    }
  }, [session]);

  async function loadSettings() {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        // Supprimer les doublons
        const colors: string[] = data.colors || [];
        const types: string[] = data.types || [];
        const uniqueColors = [...new Set(colors)];
        const uniqueTypes = [...new Set(types)];
        setAvailableColors(uniqueColors);
        setAvailableTypes(uniqueTypes);
      }
    } catch (err) {
      console.error("Error loading settings:", err);
    }
  }

  // Détection du paramètre edit dans l'URL
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && creations.length > 0) {
      const creation = creations.find((c) => c._id === editId);
      if (creation) {
        handleEditClick(creation);
        // Retirer le paramètre de l'URL après chargement
        router.replace("/admin/creations", { scroll: false });
      }
    }
  }, [searchParams, creations]);

  // Désactiver le scroll quand une modale est ouverte
  useEffect(() => {
    if (showEditModal || showCreateModal) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = "unset";
      document.body.style.paddingRight = "0px";
    }

    return () => {
      document.body.style.overflow = "unset";
      document.body.style.paddingRight = "0px";
    };
  }, [showEditModal, showCreateModal]);

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
      type: form.type || undefined,
      showAsNew: form.showAsNew,
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
      type: "",
      showAsNew: true,
    });
    setEditingId(null);
    setShowEditModal(false);
    setShowCreateModal(false);
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
      type: c.type ?? "",
      showAsNew: c.showAsNew !== undefined ? c.showAsNew : true,
    });
    setMessage(null);
    setShowEditModal(true);
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
        type: "",
        showAsNew: true,
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
      type: "",
      showAsNew: true,
    });
    setMessage(null);
    setShowEditModal(false);
    setShowCreateModal(false);
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

  // Gestion du drag & drop pour la liste des créations
  function handleListDragStart(index: number) {
    setListDragIndex(index);
  }

  function handleListDragOver(e: React.DragEvent<HTMLDivElement>, index: number) {
    e.preventDefault();
    if (listDragIndex === null || listDragIndex === index) return;

    setCreations((prev) => {
      const newList = [...prev];
      const [movedItem] = newList.splice(listDragIndex, 1);
      newList.splice(index, 0, movedItem);
      return newList;
    });

    setListDragIndex(index);
  }

  function handleListDragEnd() {
    setListDragIndex(null);
  }

  // Gestion du touch pour la liste des créations (mobile)
  function handleListTouchStart(index: number) {
    setListTouchStartIndex(index);
    setListDragIndex(index);
  }

  function handleListTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (listTouchStartIndex === null) return;
    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!element) return;

    const creationCard = element.closest("[data-creation-index]");
    if (!creationCard) return;

    const targetIndex = Number(creationCard.getAttribute("data-creation-index"));

    if (targetIndex !== listTouchStartIndex && targetIndex >= 0) {
      setCreations((prev) => {
        const newList = [...prev];
        const [movedItem] = newList.splice(listTouchStartIndex, 1);
        newList.splice(targetIndex, 0, movedItem);
        return newList;
      });

      setListTouchStartIndex(targetIndex);
      setListDragIndex(targetIndex);
    }
  }

  function handleListTouchEnd() {
    setListTouchStartIndex(null);
    setListDragIndex(null);
  }

  async function saveCreationOrder() {
    try {
      setSavingOrder(true);
      const orderedIds = creations.map((c) => c._id);
      
      const res = await fetch("/api/creations/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });

      if (!res.ok) {
        throw new Error("Erreur lors de la sauvegarde");
      }

      setMessage("Ordre d'affichage sauvegardé ✔️");
      setTimeout(() => setMessage(null), 3000);
      await loadCreations(); // Recharger pour s'assurer que l'ordre est correct
    } catch (err) {
      console.error(err);
      setMessage("Erreur lors de la sauvegarde de l'ordre.");
    } finally {
      setSavingOrder(false);
    }
  }

  async function handleMakeAvailableAgain(id: string) {
    const ok = confirm("Remettre cet article disponible ?");
    if (!ok) return;

    try {
      const res = await fetch(`/api/creations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reserved: false,
          sold: false,
        }),
      });

      if (!res.ok) {
        throw new Error("Erreur lors de la mise à jour");
      }

      setMessage("Article remis disponible ✔️");
      setTimeout(() => setMessage(null), 3000);
      loadCreations();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la remise en disponibilité");
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
        <div className="mb-6">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-2"
          >
            ← Retour à l&apos;administration
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Gestion des créations
          </h1>
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

        <div className="space-y-6">
          {/* Bouton d'ajout */}
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setEditingId(null);
                setForm({
                  title: "",
                  description: "",
                  imageUrl: "",
                  images: [],
                  imagePublicIds: [],
                  price: "",
                  color: "",
                  type: "",
                  showAsNew: true,
                });
                setShowCreateModal(true);
              }}
              className="bg-slate-900 hover:bg-slate-800"
            >
              ➕ Ajouter une création
            </Button>
          </div>

          {/* Liste des créations */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                📦 Créations existantes ({creations.length})
              </h2>
              {creations.length > 1 && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={saveCreationOrder}
                  disabled={savingOrder}
                >
                  {savingOrder ? "⏳ Sauvegarde..." : "💾 Sauvegarder l'ordre"}
                </Button>
              )}
            </div>

            {loadingList && (
              <p className="text-sm text-slate-500">Chargement...</p>
            )}

            {!loadingList && creations.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">
                Aucune création pour l&apos;instant. Créez-en une ci-dessus !
              </p>
            )}

            {creations.length > 1 && (
              <p className="text-xs text-slate-500 mb-3">
                💡 Glissez les créations pour réorganiser l&apos;ordre d&apos;affichage sur la page d&apos;accueil
              </p>
            )}

            <div className="space-y-2">
              {creations.map((c, index) => (
                <div
                  key={c._id}
                  data-creation-index={index}
                  draggable
                  onDragStart={() => handleListDragStart(index)}
                  onDragOver={(e) => handleListDragOver(e, index)}
                  onDragEnd={handleListDragEnd}
                  onTouchStart={() => handleListTouchStart(index)}
                  onTouchMove={handleListTouchMove}
                  onTouchEnd={handleListTouchEnd}
                  className={`flex flex-col gap-3 rounded-xl border bg-white p-3 transition hover:shadow-sm sm:flex-row sm:items-center sm:justify-between cursor-move ${
                    listDragIndex === index
                      ? "border-blue-500 ring-2 ring-blue-200"
                      : "border-slate-200"
                  }`}
                  style={{ touchAction: "none" }}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-600">
                      {index + 1}
                    </div>
                    {c.imageUrl && (
                      <img
                        src={c.imageUrl}
                        alt={c.title}
                        className="h-16 w-16 shrink-0 rounded-lg object-cover"
                        draggable={false}
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
                        {c.type && (
                          <Badge variant="default">{c.type.charAt(0).toUpperCase() + c.type.slice(1)}</Badge>
                        )}
                        {c.color && (
                          <Badge variant="default">{c.color.charAt(0).toUpperCase() + c.color.slice(1)}</Badge>
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
                    {(c.reserved || c.sold) && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleMakeAvailableAgain(c._id)}
                        title="Remettre disponible"
                        className="bg-green-600 hover:bg-green-700"
                      >
                        ↻ Disponible
                      </Button>
                    )}
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
      </div>

      {/* Modale d'édition */}
      {showEditModal && (
        <>
          {/* Fond semi-transparent */}
          <div 
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 animate-fadeIn"
            onClick={handleCancelEdit}
          />
          
          <div className="fixed top-0 right-0 h-full w-full sm:w-[600px] bg-white shadow-2xl p-6 z-50 overflow-y-auto animate-slideInRight">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900">✏️ Modifier la création</h2>
              <button
                onClick={handleCancelEdit}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 text-slate-600"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            {/* Formulaire d'édition */}
            <form onSubmit={handleSubmit} className="space-y-4">
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

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Type d'article</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                >
                  <option value="">-- Sélectionner --</option>
                  {availableTypes.map((type) => (
                    <option key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

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
                  <select
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                  >
                    <option value="">-- Sélectionner --</option>
                    {availableColors.map((color) => (
                      <option key={color} value={color}>
                        {color.charAt(0).toUpperCase() + color.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Flag New */}
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm hover:bg-slate-100">
                <input
                  type="checkbox"
                  checked={form.showAsNew !== undefined ? form.showAsNew : true}
                  onChange={(e) => setForm({ ...form, showAsNew: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-red-500 focus:ring-red-500"
                />
                <span className="text-slate-700">
                  <span className="font-semibold">Afficher le badge "New"</span>
                  <span className="ml-2 text-xs text-slate-500">(automatiquement masqué après 7 jours)</span>
                </span>
              </label>

              {/* Images */}
              <div className="space-y-3">
                <label className="text-xs font-medium text-slate-700">Images</label>
                <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageChange}
                    className="hidden"
                    id="file-upload-modal"
                    disabled={uploading}
                  />
                  <label
                    htmlFor="file-upload-modal"
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

              {/* Boutons */}
              <div className="flex gap-2 pt-4 border-t">
                <Button type="submit" disabled={uploading || !form.title} className="flex-1">
                  {uploading ? "⏳ Upload..." : "💾 Mettre à jour"}
                </Button>
                <Button type="button" variant="secondary" onClick={handleCancelEdit}>
                  Annuler
                </Button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Modale de création */}
      {showCreateModal && (
        <>
          {/* Fond semi-transparent */}
          <div 
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 animate-fadeIn"
            onClick={handleCancelEdit}
          />
          
          <div className="fixed top-0 right-0 h-full w-full sm:w-[600px] bg-white shadow-2xl p-6 z-50 overflow-y-auto animate-slideInRight">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900">➕ Ajouter une création</h2>
              <button
                onClick={handleCancelEdit}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 text-slate-600"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            {/* Formulaire de création */}
            <form onSubmit={handleSubmit} className="space-y-4">
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

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Type d'article</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                >
                  <option value="">-- Sélectionner --</option>
                  {availableTypes.map((type) => (
                    <option key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

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
                  <select
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                  >
                    <option value="">-- Sélectionner --</option>
                    {availableColors.map((color) => (
                      <option key={color} value={color}>
                        {color.charAt(0).toUpperCase() + color.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Flag New */}
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm hover:bg-slate-100">
                <input
                  type="checkbox"
                  checked={form.showAsNew !== undefined ? form.showAsNew : true}
                  onChange={(e) => setForm({ ...form, showAsNew: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-red-500 focus:ring-red-500"
                />
                <span className="text-slate-700">
                  <span className="font-semibold">Afficher le badge "New"</span>
                  <span className="ml-2 text-xs text-slate-500">(automatiquement masqué après 7 jours)</span>
                </span>
              </label>

              {/* Images */}
              <div className="space-y-3">
                <label className="text-xs font-medium text-slate-700">Images</label>
                <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageChange}
                    className="hidden"
                    id="file-upload-create"
                    disabled={uploading}
                  />
                  <label
                    htmlFor="file-upload-create"
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

              {/* Boutons */}
              <div className="flex gap-2 pt-4 border-t">
                <Button type="submit" disabled={uploading || !form.title} className="flex-1">
                  {uploading ? "⏳ Upload..." : "➕ Créer"}
                </Button>
                <Button type="button" variant="secondary" onClick={handleCancelEdit}>
                  Annuler
                </Button>
              </div>
            </form>
          </div>
        </>
      )}
    </main>
  );
}

export default function AdminCreationsPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-600">Chargement...</div>
      </main>
    }>
      <AdminCreationsContent />
    </Suspense>
  );
}
