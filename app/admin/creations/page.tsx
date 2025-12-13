"use client";

import Link from "next/link";
import { FormEvent, useState, useEffect, useRef, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components";
import { CreationModal } from "@/components/CreationModal";
import { CreationFormModal } from "@/components/admin/CreationFormModal";
import { CreationsList } from "@/components/admin/CreationsList";
import { generateSeoDescription } from "@/lib/seoGenerator";

type Creation = {
  _id: string;
  title: string;
  description?: string;
  seoDescription?: string;
  imageUrl?: string;
  images?: string[];
  imagePublicIds?: string[];
  price?: number;
  color?: string;
  type?: "bonnet" | "tour de cou" | "bandeau";
  showAsNew?: boolean;
  displayOrder?: number;
  sold?: boolean;
  slug?: string;
  createdAt?: string;
  yarnBrand?: string;
  weight?: number;
  yarnPrice?: number;
  relatedCreations?: string[] | any[];
};

type CreationFormData = {
  title: string;
  description: string;
  seoDescription: string;
  imageUrl: string;
  images: string[];
  imagePublicIds: string[];
  price: string;
  color: string;
  type: string;
  showAsNew: boolean;
  yarnBrand: string;
  weight: string;
  yarnPrice: string;
  relatedCreations: string[];
};

const initialFormState: CreationFormData = {
    title: "",
    description: "",
    seoDescription: "",
    imageUrl: "",
  images: [],
  imagePublicIds: [],
    price: "",
    color: "",
  type: "",
  showAsNew: true,
  yarnBrand: "",
  weight: "",
  yarnPrice: "",
  relatedCreations: [],
};

function AdminCreationsContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [form, setForm] = useState<CreationFormData>(initialFormState);
  const [message, setMessage] = useState<string | null>(null);
  const [creations, setCreations] = useState<Creation[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [availableColors, setAvailableColors] = useState<string[]>([]);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("tous");
  const [yarnBrandFilter, setYarnBrandFilter] = useState<string>("toutes");
  const [sortByDate, setSortByDate] = useState<"custom" | "asc" | "desc">("custom");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedCreation, setSelectedCreation] = useState<Creation | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  const hasLoadedCreations = useRef(false);

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

  const yarnBrandOptions = Array.from(
    new Set(
      creations
        .map((c) => c.yarnBrand?.trim())
        .filter((c): c is string => Boolean(c))
    )
  ).sort((a, b) => a.localeCompare(b, 'fr'));

  const filteredCreations = creations
    .filter((c) => {
      if (statusFilter === "disponible" && c.sold) return false;
      if (statusFilter === "vendu" && !c.sold) return false;
      
      if (yarnBrandFilter === "sans marque") {
        if (c.yarnBrand && c.yarnBrand.trim() !== "") return false;
      } else if (yarnBrandFilter !== "toutes" && c.yarnBrand !== yarnBrandFilter) {
        return false;
      }
      
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchTitle = c.title?.toLowerCase().includes(query);
        const matchDescription = c.description?.toLowerCase().includes(query);
        const matchColor = c.color?.toLowerCase().includes(query);
        const matchType = c.type?.toLowerCase().includes(query);
        const matchPrice = c.price?.toString().includes(query);
        const matchYarnBrand = c.yarnBrand?.toLowerCase().includes(query);
        return matchTitle || matchDescription || matchColor || matchType || matchPrice || matchYarnBrand;
      }
      
      return true;
    })
    .sort((a, b) => {
      if (sortByDate === "custom") {
        // Ordre personnalisé : utiliser displayOrder (décroissant, plus grand = en premier)
        const orderA = a.displayOrder ?? 0;
        const orderB = b.displayOrder ?? 0;
        return orderB - orderA;
      } else {
        // Tri par date
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return sortByDate === "desc" ? dateB - dateA : dateA - dateB;
      }
    });

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated" || session?.user?.role !== "admin") {
      router.push("/");
    }
  }, [session, status, router]);

  useEffect(() => {
    if (session?.user?.role === "admin" && !hasLoadedCreations.current) {
      loadCreations();
      loadSettings();
    }
  }, [session]);

  async function loadSettings() {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        const colors: string[] = data.colors || [];
        const types: string[] = data.types || [];
        const uniqueColors = [...new Set(colors)];
        const uniqueTypes = [...new Set(types)];
        
        const sortedColors = uniqueColors
          .filter(c => c !== "multicolore")
          .sort((a, b) => a.localeCompare(b, 'fr'))
          .concat(uniqueColors.filter(c => c === "multicolore"));
        
        const sortedTypes = uniqueTypes.sort((a, b) => a.localeCompare(b, 'fr'));
        
        setAvailableColors(sortedColors);
        setAvailableTypes(sortedTypes);
      }
    } catch (err) {
      console.error("Error loading settings:", err);
    }
  }

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && creations.length > 0) {
      const creation = creations.find((c) => c._id === editId);
      if (creation) {
        handleEditClick(creation);
        router.replace("/admin/creations", { scroll: false });
      }
    }
  }, [searchParams, creations, router]);

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
      hasLoadedCreations.current = true;
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingList(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    const payload = {
      title: form.title,
      description: form.description || undefined,
      seoDescription: form.seoDescription || undefined,
      imageUrl: form.images[0] || undefined,
      images: form.images,
      imagePublicIds: form.imagePublicIds,
      price: form.price ? Number(form.price) : undefined,
      color: form.color || undefined,
      type: form.type || undefined,
      showAsNew: form.showAsNew,
      yarnBrand: form.yarnBrand || undefined,
      weight: form.weight ? Number(form.weight) : undefined,
      yarnPrice: form.yarnPrice ? Number(form.yarnPrice) : undefined,
      relatedCreations: form.relatedCreations || [],
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
    
    setForm(initialFormState);
    setEditingId(null);
    setShowEditModal(false);
    setShowCreateModal(false);
    loadCreations();
  }

  function handleEditClick(c: Creation) {
    setEditingId(c._id);
    // Extraire les IDs des articles liés (peuvent être des objets ou des strings)
    const relatedIds = Array.isArray(c.relatedCreations)
      ? c.relatedCreations.map((item: any) => 
          typeof item === 'string' ? item : item._id || item.toString()
        )
      : [];
    setForm({
      title: c.title ?? "",
      description: c.description ?? "",
      seoDescription: c.seoDescription ?? "",
      imageUrl: "",
      images: c.images ?? (c.imageUrl ? [c.imageUrl] : []),
      price: c.price != null ? String(c.price) : "",
      imagePublicIds: c.imagePublicIds ?? [],
      color: c.color ?? "",
      type: c.type ?? "",
      showAsNew: c.showAsNew !== undefined ? c.showAsNew : true,
      yarnBrand: c.yarnBrand ?? "",
      weight: c.weight != null ? String(c.weight) : "",
      yarnPrice: c.yarnPrice != null ? String(c.yarnPrice) : "",
      relatedCreations: relatedIds,
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
      setForm(initialFormState);
    }

    loadCreations();
  }

  function handleCancelEdit() {
    setEditingId(null);
    setForm(initialFormState);
    setMessage(null);
    setShowEditModal(false);
    setShowCreateModal(false);
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
      await loadCreations();
    } catch (err) {
      console.error(err);
      setMessage("Erreur lors de la sauvegarde de l'ordre.");
    } finally {
      setSavingOrder(false);
    }
  }

  function handleReorder(newCreations: Creation[]) {
    setCreations(newCreations);
  }

  async function handleMakeAvailableAgain(id: string) {
    const ok = confirm("Remettre cet article disponible ?");
    if (!ok) return;

    try {
      const res = await fetch(`/api/creations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
                setForm(initialFormState);
                setShowCreateModal(true);
              }}
              className="bg-slate-900 hover:bg-slate-800 cursor-pointer"
            >
              ➕ Ajouter une création
            </Button>
          </div>

          {/* Liste des créations */}
          <CreationsList
            creations={creations}
            filteredCreations={filteredCreations}
            loadingList={loadingList}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            yarnBrandFilter={yarnBrandFilter}
            onYarnBrandFilterChange={setYarnBrandFilter}
            yarnBrandOptions={yarnBrandOptions}
            sortByDate={sortByDate}
            onSortByDateChange={setSortByDate}
            onEdit={handleEditClick}
            onDelete={handleDelete}
            onViewDetails={(c) => {
                        setSelectedCreation(c);
                        setShowDetailModal(true);
                      }}
            onMakeAvailable={handleMakeAvailableAgain}
            onReorder={handleReorder}
            onSaveOrder={saveCreationOrder}
            savingOrder={savingOrder}
          />
        </div>
      </div>

      {/* Modale d'édition */}
      <CreationFormModal
        isOpen={showEditModal}
        isEdit={true}
        form={form}
        onFormChange={setForm}
        onSubmit={handleSubmit}
        onCancel={handleCancelEdit}
        uploading={false}
        availableColors={availableColors}
        availableTypes={availableTypes}
        availableCreations={creations}
        currentCreationId={editingId}
      />

      {/* Modale de création */}
      <CreationFormModal
        isOpen={showCreateModal}
        isEdit={false}
        form={form}
        onFormChange={setForm}
        onSubmit={handleSubmit}
        onCancel={handleCancelEdit}
        uploading={false}
        availableColors={availableColors}
        availableTypes={availableTypes}
        availableCreations={creations}
        currentCreationId={null}
      />

      {/* Modale de détails */}
      {showDetailModal && selectedCreation && (
        <CreationModal
          creation={selectedCreation}
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedCreation(null);
          }}
          hideActions={true}
        />
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
