"use client";

import { FormEvent, ChangeEvent, useState, useEffect, useRef } from "react";
import { Button, Input, Textarea } from "@/components";
import { generateSeoDescription } from "@/lib/seoGenerator";
import { useImageUpload } from "@/hooks/useImageUpload";

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

type Creation = {
  _id: string;
  title: string;
  imageUrl?: string;
  images?: string[];
  sold?: boolean;
  color?: string;
  type?: string;
  yarnBrand?: string;
};

interface CreationFormModalProps {
  isOpen: boolean;
  isEdit: boolean;
  form: CreationFormData;
  onFormChange: (form: CreationFormData) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  uploading: boolean;
  availableColors: string[];
  availableTypes: string[];
  availableCreations?: Creation[];
  currentCreationId?: string | null;
  initialFormData?: CreationFormData;
}

export function CreationFormModal({
  isOpen,
  isEdit,
  form,
  onFormChange,
  onSubmit,
  onCancel,
  uploading,
  availableColors,
  availableTypes,
  availableCreations = [],
  currentCreationId = null,
  initialFormData,
}: CreationFormModalProps) {
  const {
    uploading: isUploading,
    dragIndex,
    handleImageChange: handleImageUpload,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useImageUpload();

  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [yarnBrands, setYarnBrands] = useState<string[]>([]);
  const [showBrandSuggestions, setShowBrandSuggestions] = useState(false);
  const [filteredBrands, setFilteredBrands] = useState<string[]>([]);
  const [showRelatedCreations, setShowRelatedCreations] = useState(false);
  const yarnBrandInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const relatedCreationsScrollRef = useRef<HTMLDivElement>(null);
  const savedScrollPositionRef = useRef<number>(0);

  const images = form.images;
  const publicIds = form.imagePublicIds;

  // Charger les marques de fil depuis l'API
  useEffect(() => {
    const fetchYarnBrands = async () => {
      try {
        const response = await fetch("/api/creations/yarn-brands");
        if (response.ok) {
          const brands = await response.json();
          setYarnBrands(brands);
        }
      } catch (error) {
        console.error("Erreur lors du chargement des marques:", error);
      }
    };
    fetchYarnBrands();
  }, []);

  // Filtrer les suggestions basées sur la saisie
  useEffect(() => {
    const trimmedValue = form.yarnBrand.trim();
    
    if (trimmedValue === "") {
      setFilteredBrands([]);
      setShowBrandSuggestions(false);
      return;
    }

    // Vérifier si la valeur actuelle correspond exactement à une marque existante
    const exactMatch = yarnBrands.some(
      (brand) => brand.toLowerCase() === trimmedValue.toLowerCase()
    );

    // Si c'est une correspondance exacte, ne pas afficher de suggestions
    if (exactMatch) {
      setFilteredBrands([]);
      setShowBrandSuggestions(false);
      return;
    }

    // Filtrer les marques qui contiennent la saisie, en excluant la valeur exacte
    const filtered = yarnBrands.filter(
      (brand) =>
        brand.toLowerCase().includes(trimmedValue.toLowerCase()) &&
        brand.toLowerCase() !== trimmedValue.toLowerCase()
    );
    setFilteredBrands(filtered);
    setShowBrandSuggestions(filtered.length > 0);
  }, [form.yarnBrand, yarnBrands]);

  // Fermer les suggestions quand on clique en dehors
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        yarnBrandInputRef.current &&
        !yarnBrandInputRef.current.contains(event.target as Node)
      ) {
        setShowBrandSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Restaurer la position du scroll après un changement dans les recommandations
  useEffect(() => {
    if (relatedCreationsScrollRef.current && savedScrollPositionRef.current > 0) {
      // Utiliser requestAnimationFrame pour s'assurer que le DOM est mis à jour
      requestAnimationFrame(() => {
        if (relatedCreationsScrollRef.current) {
          relatedCreationsScrollRef.current.scrollTop = savedScrollPositionRef.current;
        }
      });
    }
  }, [form.relatedCreations]);

  const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    try {
      await handleImageUpload(e, (uploadedUrls, uploadedPublicIds) => {
        onFormChange({
          ...form,
          images: [...form.images, ...uploadedUrls],
          imagePublicIds: [...form.imagePublicIds, ...uploadedPublicIds],
        });
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveImage = (index: number) => {
    onFormChange({
      ...form,
      images: form.images.filter((_, i) => i !== index),
      imagePublicIds: form.imagePublicIds.filter((_, i) => i !== index),
    });
  };

  const handleImageReorder = (newImages: string[], newPublicIds: string[]) => {
    onFormChange({
      ...form,
      images: newImages,
      imagePublicIds: newPublicIds,
    });
  };

  const handleGenerateSeoDescription = () => {
    const generated = generateSeoDescription({
      title: form.title,
      color: form.color,
      type: form.type,
      price: form.price,
    });
    onFormChange({ ...form, seoDescription: generated });
  };

  const handleGenerateDescriptionWithAI = async () => {
    if (!form.type || !form.color || !form.yarnBrand || !form.price) {
      alert("Veuillez remplir les champs Type, Couleur, Marque de fil et Prix avant de générer la description.");
      return;
    }

    setGeneratingDescription(true);
    try {
      const response = await fetch("/api/generate-description", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: form.type,
          color: form.color,
          material: form.yarnBrand, // Utilise yarnBrand comme material
          price: parseFloat(form.price) || 0,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erreur lors de la génération");
      }

      const data = await response.json();
      onFormChange({ ...form, seoDescription: data.description });
    } catch (error) {
      console.error("Erreur lors de la génération:", error);
      alert(error instanceof Error ? error.message : "Erreur lors de la génération de la description");
    } finally {
      setGeneratingDescription(false);
    }
  };

  // Fonction pour calculer la similarité entre deux chaînes (algorithme simple)
  const calculateSimilarity = (str1: string, str2: string): number => {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    // Si les chaînes sont identiques
    if (s1 === s2) return 1;
    
    // Si l'une contient l'autre
    if (s1.includes(s2) || s2.includes(s1)) return 0.8;
    
    // Calculer le nombre de mots communs
    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);
    const commonWords = words1.filter(word => words2.includes(word));
    
    if (commonWords.length === 0) return 0;
    
    // Score basé sur le ratio de mots communs
    return commonWords.length / Math.max(words1.length, words2.length);
  };

  // Vérifier s'il y a des modifications par rapport à l'état initial
  const hasChanges = (): boolean => {
    if (!isEdit || !initialFormData) {
      return true; // En mode création, toujours permettre la soumission
    }

    // Comparer tous les champs
    const compareArrays = (a: string[], b: string[]): boolean => {
      if (a.length !== b.length) return false;
      const sortedA = [...a].sort();
      const sortedB = [...b].sort();
      return sortedA.every((val, index) => val === sortedB[index]);
    };

    return (
      form.title.trim() !== initialFormData.title.trim() ||
      (form.description || "") !== (initialFormData.description || "") ||
      (form.seoDescription || "") !== (initialFormData.seoDescription || "") ||
      form.price !== initialFormData.price ||
      form.color !== initialFormData.color ||
      form.type !== initialFormData.type ||
      (form.yarnBrand || "") !== (initialFormData.yarnBrand || "") ||
      (form.weight || "") !== (initialFormData.weight || "") ||
      (form.yarnPrice || "") !== (initialFormData.yarnPrice || "") ||
      form.showAsNew !== initialFormData.showAsNew ||
      !compareArrays(form.images, initialFormData.images) ||
      !compareArrays(form.imagePublicIds, initialFormData.imagePublicIds) ||
      !compareArrays(form.relatedCreations, initialFormData.relatedCreations)
    );
  };

  // Trier les articles liés par pertinence
  const getSortedRelatedCreations = () => {
    const currentColor = form.color?.toLowerCase().trim() || "";
    const currentYarnBrand = form.yarnBrand?.toLowerCase().trim() || "";

    // Filtrer les articles disponibles (non vendus, pas l'article actuel)
    const available = availableCreations.filter(
      (c) => c._id !== currentCreationId && !c.sold
    );

    // Séparer les articles déjà sélectionnés des autres
    const selected: Creation[] = [];
    const matching: Creation[] = [];

    available.forEach((c) => {
      if (form.relatedCreations.includes(c._id)) {
        // Garder tous les articles déjà sélectionnés
        selected.push(c);
      } else {
        // Pour les articles non sélectionnés, ne garder que ceux qui matchent les critères
        const cColor = c.color?.toLowerCase().trim() || "";
        const cYarnBrand = c.yarnBrand?.toLowerCase().trim() || "";

        // Si on a une couleur ET une marque de fil définies : seulement ceux avec même couleur ET même marque
        if (currentColor && currentYarnBrand) {
          if (cColor === currentColor && cYarnBrand === currentYarnBrand) {
            matching.push(c);
          }
        }
        // Si on a seulement une couleur : seulement ceux avec même couleur
        else if (currentColor) {
          if (cColor === currentColor) {
            matching.push(c);
          }
        }
        // Si ni couleur ni marque : ne rien afficher (pas de critères de matching)
      }
    });

    // Retourner d'abord les articles sélectionnés, puis ceux qui matchent les critères
    return [...selected, ...matching];
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Fond semi-transparent */}
      <div 
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 animate-fadeIn"
        onClick={onCancel}
      />
      
      <div className="fixed top-0 right-0 h-full w-full sm:w-[600px] bg-white shadow-2xl z-50 animate-slideInRight flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 shrink-0">
          <h2 className="text-xl font-bold text-slate-900">
            {isEdit ? "✏️ Modifier la création" : "➕ Ajouter une création"}
          </h2>
          <button
            onClick={onCancel}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 text-slate-600"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Formulaire */}
        <form onSubmit={onSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <Input
            label="Titre *"
            placeholder="Ex : Snood rose poudré"
            value={form.title}
            onChange={(e) => onFormChange({ ...form, title: e.target.value })}
            required
          />

          <Textarea
            label="Composition"
            placeholder="Matière..."
            value={form.description}
            onChange={(e) => onFormChange({ ...form, description: e.target.value })}
            rows={2}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-700">
                Description
              </label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleGenerateDescriptionWithAI}
                disabled={generatingDescription}
                className="text-xs cursor-pointer"
              >
                {generatingDescription ? "⏳ Génération..." : "✨ Générer avec l'IA"}
              </Button>
            </div>
            <Textarea
              placeholder="Description détaillée..."
              value={form.seoDescription}
              onChange={(e) => onFormChange({ ...form, seoDescription: e.target.value })}
              rows={6}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Type d'article *</label>
            <select
              value={form.type}
              onChange={(e) => onFormChange({ ...form, type: e.target.value })}
              required
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
              label="Prix (€) *"
              type="number"
              placeholder="25"
              value={form.price}
              onChange={(e) => onFormChange({ ...form, price: e.target.value })}
              required
              min="0"
              step="0.01"
            />

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Couleur *</label>
              <select
                value={form.color}
                onChange={(e) => onFormChange({ ...form, color: e.target.value })}
                required
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

          {/* Informations admin uniquement */}
          <div className="pt-4 border-t border-slate-200">
            <p className="text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide">
              🔒 Informations admin (non visibles pour les utilisateurs)
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="relative">
                  <Input
                    ref={yarnBrandInputRef}
                    label="Marque de fil"
                    placeholder="Ex : Drops, Phildar..."
                    value={form.yarnBrand}
                    onChange={(e) => onFormChange({ ...form, yarnBrand: e.target.value })}
                    onFocus={() => {
                      if (filteredBrands.length > 0) {
                        setShowBrandSuggestions(true);
                      }
                    }}
                  />
                  {showBrandSuggestions && filteredBrands.length > 0 && (
                    <div
                      ref={suggestionsRef}
                      className="absolute z-50 mt-1 w-full max-h-48 overflow-auto bg-white border border-slate-200 rounded-lg shadow-lg"
                    >
                      {filteredBrands.map((brand, index) => (
                        <button
                          key={index}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 first:rounded-t-lg last:rounded-b-lg transition-colors"
                          onClick={() => {
                            onFormChange({ ...form, yarnBrand: brand });
                            setShowBrandSuggestions(false);
                            yarnBrandInputRef.current?.blur();
                          }}
                        >
                          {brand}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Input
                  label="Poids (grammes)"
                  type="number"
                  placeholder="Ex : 150"
                  value={form.weight}
                  onChange={(e) => onFormChange({ ...form, weight: e.target.value })}
                />
                <Input
                  label="Prix du fil (€/100g)"
                  type="number"
                  step="0.01"
                  placeholder="Ex : 12.50"
                  value={form.yarnPrice}
                  onChange={(e) => onFormChange({ ...form, yarnPrice: e.target.value })}
                />
              </div>
              <Input
                label="Coût de fabrication (€)"
                type="text"
                value={(() => {
                  const weight = parseFloat(form.weight);
                  const price = parseFloat(form.yarnPrice);
                  if (!isNaN(weight) && !isNaN(price) && weight > 0 && price > 0) {
                    const cost = (weight / 100) * price;
                    return cost.toFixed(2);
                  }
                  return "";
                })()}
                readOnly
                className="bg-slate-50 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Flag New */}
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm hover:bg-slate-100">
            <input
              type="checkbox"
              checked={form.showAsNew !== undefined ? form.showAsNew : true}
              onChange={(e) => onFormChange({ ...form, showAsNew: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-red-500 focus:ring-red-500"
            />
            <span className="text-slate-700">
              <span className="font-semibold">Afficher le badge "New"</span>
              <span className="ml-2 text-xs text-slate-500">(automatiquement masqué après 7 jours)</span>
            </span>
          </label>

          {/* Articles liés */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowRelatedCreations((v) => !v)}
              aria-expanded={showRelatedCreations}
              className="w-full flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left cursor-pointer hover:bg-slate-100"
            >
              <span className="text-xs font-medium text-slate-700">
                Articles liés (recommandations)
              </span>
              <span className="flex items-center gap-2 text-xs text-slate-500">
                <span>
                  {form.relatedCreations.length} sélectionné{form.relatedCreations.length > 1 ? "s" : ""}
                </span>
                <span className="text-slate-700">{showRelatedCreations ? "▲" : "▼"}</span>
              </span>
            </button>
            {showRelatedCreations && (
              <>
                <p className="text-xs text-slate-500 mb-2">
                  Sélectionnez les articles à proposer comme recommandations sur la page de cet article
                </p>
                <div 
                  ref={relatedCreationsScrollRef}
                  className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg p-3 space-y-2"
                >
                  {getSortedRelatedCreations().map((creation) => {
                    const isSelected = form.relatedCreations.includes(creation._id);
                    const imageUrl = creation.images?.[0] || creation.imageUrl;
                    return (
                      <label
                        key={creation._id}
                        className={`flex items-center gap-3 p-2 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected
                            ? "border-slate-900 bg-slate-50"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            // Sauvegarder la position du scroll avant le changement
                            if (relatedCreationsScrollRef.current) {
                              savedScrollPositionRef.current = relatedCreationsScrollRef.current.scrollTop;
                            }
                            
                            const newRelated = e.target.checked
                              ? [...form.relatedCreations, creation._id]
                              : form.relatedCreations.filter((id) => id !== creation._id);
                            onFormChange({ ...form, relatedCreations: newRelated });
                          }}
                          className="sr-only"
                        />
                        {imageUrl && (
                          <img
                            src={imageUrl}
                            alt={creation.title}
                            title={creation.title}
                            className="w-12 h-12 object-cover rounded"
                          />
                        )}
                        <span className="flex-1 text-sm font-medium text-slate-900">
                          {creation.title}
                        </span>
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                            isSelected ? "border-slate-900 bg-slate-900" : "border-slate-300"
                          }`}
                        >
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </div>
                      </label>
                    );
                  })}
                  {getSortedRelatedCreations().length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-4">
                      Aucun autre article disponible
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

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
                id={`file-upload-${isEdit ? "edit" : "create"}`}
                disabled={isUploading}
              />
              <label
                htmlFor={`file-upload-${isEdit ? "edit" : "create"}`}
                className={`block cursor-pointer ${isUploading ? 'opacity-50' : ''}`}
              >
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-slate-200">
                  📁
                </div>
                <p className="text-sm font-medium text-slate-700">
                  {isUploading ? "Upload en cours..." : "Cliquez pour ajouter des images"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  ou glissez-déposez vos fichiers
                </p>
              </label>
            </div>

            {images.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-700">
                  {images.length} image{images.length > 1 ? "s" : ""} ajoutée{images.length > 1 ? "s" : ""}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {images.map((url, i) => (
                    <div
                      key={i}
                      data-image-index={i}
                      draggable
                      onDragStart={() => handleDragStart(i)}
                      onDragOver={(e) => handleDragOver(e, i, handleImageReorder, images, publicIds)}
                      onDragEnd={handleDragEnd}
                      onTouchStart={() => handleTouchStart(i)}
                      onTouchMove={(e) => handleTouchMove(e, handleImageReorder, images, publicIds)}
                      onTouchEnd={handleTouchEnd}
                      className={`relative aspect-square cursor-move rounded-lg overflow-hidden ${
                        dragIndex === i ? "ring-2 ring-blue-500" : "ring-1 ring-slate-200"
                      }`}
                      style={{ touchAction: "none" }}
                    >
                      <button
                        onClick={() => handleRemoveImage(i)}
                        type="button"
                        className="absolute -right-1 -top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs hover:bg-red-600 cursor-pointer"
                      >
                        ✕
                      </button>
                      {i === 0 && (
                        <div className="absolute left-1 top-1 z-10 rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-white pointer-events-none">
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
          
          {/* Boutons */}
          <div className="flex gap-2 p-6 border-t border-slate-200 bg-white shrink-0">
            <Button 
              type="submit" 
              disabled={
                isUploading || 
                !form.title.trim() || 
                !form.type || 
                !form.price || 
                parseFloat(form.price) <= 0 || 
                !form.color ||
                (isEdit && !hasChanges())
              } 
              className="flex-1 cursor-pointer"
            >
              {isUploading ? "⏳ Upload..." : (isEdit ? "💾 Mettre à jour" : "➕ Créer")}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel} className="cursor-pointer">
              Annuler
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

