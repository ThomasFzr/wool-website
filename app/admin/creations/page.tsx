"use client";

import Link from "next/link";
import { FormEvent, useState, useEffect, useRef, Suspense } from "react";
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
  hidden?: boolean;
  slug?: string;
  createdAt?: string;
  visibleAt?: string;
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
  const router = useRouter();
  const searchParams = useSearchParams();

  const [form, setForm] = useState<CreationFormData>(initialFormState);
  const [initialFormData, setInitialFormData] = useState<CreationFormData | undefined>(undefined);
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
  const [typeFilter, setTypeFilter] = useState<string>("tous");
  const [colorFilter, setColorFilter] = useState<string>("toutes");
  const [sortByDate, setSortByDate] = useState<"custom" | "asc" | "desc">("custom");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedCreation, setSelectedCreation] = useState<Creation | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [initialOrder, setInitialOrder] = useState<string[]>([]);
  
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

  const typeOptions = Array.from(
    new Set(
      creations
        .map((c) => c.type?.trim())
        .filter((c): c is string => Boolean(c))
    )
  ).sort((a, b) => a.localeCompare(b, 'fr'));

  // Fonction pour détecter les informations manquantes
  function getMissingFields(creation: Creation): string[] {
    const missing: string[] = [];
    
    if (!creation.description || creation.description.trim() === "") {
      missing.push("Description");
    }
    if (!creation.seoDescription || creation.seoDescription.trim() === "") {
      missing.push("Description SEO");
    }
    if (!creation.color || creation.color.trim() === "") {
      missing.push("Couleur");
    }
    if (!creation.type || creation.type.trim() === "") {
      missing.push("Type");
    }
    if (!creation.price || creation.price <= 0) {
      missing.push("Prix");
    }
    if (!creation.imageUrl && (!creation.images || creation.images.length === 0)) {
      missing.push("Image");
    }
    if (creation.weight == null || creation.weight === 0) {
      missing.push("Poids");
    }
    if (!creation.yarnBrand || creation.yarnBrand.trim() === "") {
      missing.push("Marque de fil");
    }
    if (creation.yarnPrice == null || creation.yarnPrice <= 0) {
      missing.push("Prix du fil");
    }
    
    return missing;
  }

  // Articles avec des informations manquantes
  const creationsWithMissingFields = creations
    .map((c) => ({
      creation: c,
      missingFields: getMissingFields(c),
    }))
    .filter((item) => item.missingFields.length > 0)
    .sort((a, b) => b.missingFields.length - a.missingFields.length); // Plus de champs manquants en premier

  // En mode custom, on garde l'ordre du tableau (qui reflète le displayOrder)
  // En mode date, on trie par date
  const sortedCreations = sortByDate === "custom" 
    ? [...creations].sort((a, b) => {
        // Trier par displayOrder décroissant (plus grand = en premier)
        const orderA = a.displayOrder ?? 0;
        const orderB = b.displayOrder ?? 0;
        return orderB - orderA;
      })
    : [...creations].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return sortByDate === "desc" ? dateB - dateA : dateA - dateB;
      });

  const filteredCreations = sortedCreations
    .filter((c) => {
      if (statusFilter === "disponible" && c.sold) return false;
      if (statusFilter === "vendu" && !c.sold) return false;
      
      if (yarnBrandFilter === "sans marque") {
        if (c.yarnBrand && c.yarnBrand.trim() !== "") return false;
      } else if (yarnBrandFilter !== "toutes" && c.yarnBrand !== yarnBrandFilter) {
        return false;
      }
      
      if (typeFilter !== "tous" && c.type !== typeFilter) {
        return false;
      }
      
      if (colorFilter !== "toutes" && c.color !== colorFilter) {
        return false;
      }
      
      const query = searchQuery.trim().toLowerCase();
      if (query) {
        const matchTitle = c.title?.toLowerCase().includes(query);
        const matchDescription = c.description?.toLowerCase().includes(query);
        const matchColor = c.color?.toLowerCase().includes(query);
        const matchType = c.type?.toLowerCase().includes(query);
        const matchPrice = c.price?.toString().includes(query);
        const matchYarnBrand = c.yarnBrand?.toLowerCase().includes(query);
        return matchTitle || matchDescription || matchColor || matchType || matchPrice || matchYarnBrand;
      }
      
      return true;
    });

  // La garde admin est assurée côté serveur par app/admin/layout.tsx
  useEffect(() => {
    if (!hasLoadedCreations.current) {
      loadCreations();
      loadSettings();
    }
  }, []);

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
      // Sauvegarder l'ordre initial pour détecter les changements
      setInitialOrder(data.map((c: Creation) => c._id));
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

    // Validation des champs obligatoires
    if (!form.title.trim()) {
      setMessage("Le titre est obligatoire.");
      return;
    }
    if (!form.type || form.type.trim() === "") {
      setMessage("Le type d'article est obligatoire.");
      return;
    }
    if (!form.price || parseFloat(form.price) <= 0) {
      setMessage("Le prix est obligatoire et doit être supérieur à 0.");
      return;
    }
    if (!form.color || form.color.trim() === "") {
      setMessage("La couleur est obligatoire.");
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description || undefined,
      seoDescription: form.seoDescription || undefined,
      imageUrl: form.images.length > 0 ? form.images[0] : "",
      images: form.images,
      imagePublicIds: form.imagePublicIds,
      price: Number(form.price),
      color: form.color.trim(),
      type: form.type.trim(),
      showAsNew: form.showAsNew,
      yarnBrand: form.yarnBrand || undefined,
      weight: form.weight && form.weight.trim() !== "" && form.weight !== "0" ? Number(form.weight) : null,
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
      const errorData = await res.json().catch(() => ({}));
      setMessage(errorData.error || "Erreur lors de l'enregistrement.");
      return;
    }

    setMessage(editingId ? "Création mise à jour ✔️" : "Création ajoutée ✔️");
    setTimeout(() => setMessage(null), 3000);
    
    setForm(initialFormState);
    setInitialFormData(undefined);
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
    const formData = {
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
      weight: (c.weight != null && c.weight !== 0) ? String(c.weight) : "",
      yarnPrice: c.yarnPrice != null ? String(c.yarnPrice) : "",
      relatedCreations: relatedIds,
    };
    setForm(formData);
    // Sauvegarder les données initiales pour la comparaison
    setInitialFormData({ ...formData });
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
    setInitialFormData(undefined);
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
      await loadCreations(); // Cela mettra à jour initialOrder aussi
    } catch (err) {
      console.error(err);
      setMessage("Erreur lors de la sauvegarde de l'ordre.");
    } finally {
      setSavingOrder(false);
    }
  }

  // Vérifier si l'ordre a changé
  const hasOrderChanged = initialOrder.length > 0 && 
    (creations.length !== initialOrder.length ||
     creations.some((c, index) => c._id !== initialOrder[index]));

  function handleReorder(newCreations: Creation[]) {
    // Mettre à jour les displayOrder pour refléter le nouvel ordre
    const updatedCreations = newCreations.map((creation, index) => ({
      ...creation,
      displayOrder: newCreations.length - index, // Plus grand = en premier
    }));
    // Trier par displayOrder pour maintenir l'ordre visuel
    updatedCreations.sort((a, b) => (b.displayOrder ?? 0) - (a.displayOrder ?? 0));
    setCreations(updatedCreations);
  }

  async function handleToggleSold(id: string, currentSoldStatus: boolean) {
    const newStatus = !currentSoldStatus;
    const action = newStatus ? "Marquer comme vendu" : "Remettre disponible";
    const ok = confirm(`${action} cet article ?`);
    if (!ok) return;

    try {
      const res = await fetch(`/api/creations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sold: newStatus,
        }),
      });

      if (!res.ok) {
        throw new Error("Erreur lors de la mise à jour");
      }

      setMessage(newStatus ? "Article marqué comme vendu ✔️" : "Article remis disponible ✔️");
      setTimeout(() => setMessage(null), 3000);
      loadCreations();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la mise à jour");
    }
  }

  async function handleToggleHidden(id: string, hidden: boolean) {
    try {
      const res = await fetch(`/api/creations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hidden,
        }),
      });

      if (!res.ok) {
        throw new Error("Erreur lors de la mise à jour");
      }

      setMessage(hidden ? "Article caché ✔️" : "Article affiché ✔️");
      setTimeout(() => setMessage(null), 3000);
      loadCreations();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la mise à jour");
    }
  }

  async function handleToggleNew(id: string, showAsNew: boolean) {
    try {
      const body: { showAsNew: boolean; resetNewTimer?: boolean } = { showAsNew };
      if (showAsNew) body.resetNewTimer = true;

      const res = await fetch(`/api/creations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error("Erreur lors de la mise à jour");
      }

      setMessage(showAsNew ? "Badge Nouveau activé ✔️" : "Badge Nouveau retiré ✔️");
      setTimeout(() => setMessage(null), 3000);
      loadCreations();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la mise à jour");
    }
  }

  function handleDuplicate(c: Creation) {
    // Extraire les IDs des articles liés (peuvent être des objets ou des strings)
    const relatedIds = Array.isArray(c.relatedCreations)
      ? c.relatedCreations.map((item: any) => 
          typeof item === 'string' ? item : item._id || item.toString()
        )
      : [];
    
    // Pré-remplir le formulaire avec les données de l'article à dupliquer (sans photos ni poids)
    setForm({
      title: `${c.title} (copie)`,
      description: c.description ?? "",
      seoDescription: c.seoDescription ?? "",
      imageUrl: "",
      images: [],
      imagePublicIds: [],
      price: c.price != null ? String(c.price) : "",
      color: c.color ?? "",
      type: c.type ?? "",
      showAsNew: true, // Toujours afficher comme nouveau pour une copie
      yarnBrand: c.yarnBrand ?? "",
      weight: "",
      yarnPrice: c.yarnPrice != null ? String(c.yarnPrice) : "",
      relatedCreations: relatedIds,
    });
    
    // Ouvrir la modale de création (pas d'édition)
    setEditingId(null);
    setMessage(null);
    setShowCreateModal(true);
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

          {/* Suggestions d'amélioration */}
          {creationsWithMissingFields.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold text-amber-900">
                  💡 Suggestions d&apos;amélioration
                </h2>
                <span className="bg-amber-200 text-amber-900 text-xs font-semibold px-2 py-1 rounded-full">
                  {creationsWithMissingFields.length}
                </span>
              </div>
              <p className="text-sm text-amber-800 mb-4">
                Les articles suivants ont des informations manquantes. Complétez-les pour améliorer leur visibilité.
              </p>
              <div className="space-y-3">
                {(showAllSuggestions 
                  ? creationsWithMissingFields 
                  : creationsWithMissingFields.slice(0, 5)
                ).map(({ creation, missingFields }) => (
                  <div
                    key={creation._id}
                    className="bg-white rounded-lg p-4 border border-amber-300 hover:border-amber-400 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-slate-900">{creation.title}</h3>
                          {creation.sold && (
                            <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                              Vendu
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {missingFields.map((field) => (
                            <span
                              key={field}
                              className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-xs font-medium px-2 py-1 rounded"
                            >
                              <span className="text-amber-600">⚠️</span>
                              {field}
                            </span>
                          ))}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleEditClick(creation)}
                        className="cursor-pointer whitespace-nowrap"
                      >
                        ✏️ Modifier
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {creationsWithMissingFields.length > 5 && (
                <div className="mt-4 text-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowAllSuggestions(!showAllSuggestions)}
                    className="cursor-pointer"
                  >
                    {showAllSuggestions 
                      ? `▲ Voir moins (afficher 5 sur ${creationsWithMissingFields.length})` 
                      : `▼ Voir tout (${creationsWithMissingFields.length - 5} autres articles)`
                    }
                  </Button>
                </div>
              )}
            </div>
          )}

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
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            typeOptions={typeOptions}
            colorFilter={colorFilter}
            onColorFilterChange={setColorFilter}
            colorOptions={colorOptions}
            sortByDate={sortByDate}
            onSortByDateChange={setSortByDate}
            onEdit={handleEditClick}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onViewDetails={(c) => {
                        setSelectedCreation(c);
                        setShowDetailModal(true);
                      }}
            onToggleSold={handleToggleSold}
            onToggleHidden={handleToggleHidden}
            onToggleNew={handleToggleNew}
            onReorder={handleReorder}
            onSaveOrder={saveCreationOrder}
            savingOrder={savingOrder}
            hasOrderChanged={hasOrderChanged}
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
        initialFormData={initialFormData}
        onNewTimerReset={loadCreations}
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
