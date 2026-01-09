"use client";

import { Button, Input } from "@/components";
import { useRef, useEffect, useState } from "react";

interface CreationsFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: string;
  onStatusFilterChange: (filter: string) => void;
  yarnBrandFilter: string;
  onYarnBrandFilterChange: (filter: string) => void;
  totalCount: number;
  availableCount: number;
  soldCount: number;
  yarnBrandOptions: string[];
  creations: Array<{ yarnBrand?: string; type?: string; color?: string; sold?: boolean }>;
  typeFilter: string;
  onTypeFilterChange: (filter: string) => void;
  typeOptions: string[];
  colorFilter: string;
  onColorFilterChange: (filter: string) => void;
  colorOptions: string[];
  sortByDate: "custom" | "asc" | "desc";
  onSortByDateChange: (sort: "custom" | "asc" | "desc") => void;
}

export function CreationsFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  yarnBrandFilter,
  onYarnBrandFilterChange,
  totalCount,
  availableCount,
  soldCount,
  yarnBrandOptions,
  creations,
  typeFilter,
  onTypeFilterChange,
  typeOptions,
  colorFilter,
  onColorFilterChange,
  colorOptions,
  sortByDate,
  onSortByDateChange,
}: CreationsFiltersProps) {
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [yarnBrandDropdownOpen, setYarnBrandDropdownOpen] = useState(false);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const [colorDropdownOpen, setColorDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);
  const yarnBrandDropdownRef = useRef<HTMLDivElement | null>(null);
  const typeDropdownRef = useRef<HTMLDivElement | null>(null);
  const colorDropdownRef = useRef<HTMLDivElement | null>(null);
  const sortDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
      if (yarnBrandDropdownRef.current && !yarnBrandDropdownRef.current.contains(e.target as Node)) {
        setYarnBrandDropdownOpen(false);
      }
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setTypeDropdownOpen(false);
      }
      if (colorDropdownRef.current && !colorDropdownRef.current.contains(e.target as Node)) {
        setColorDropdownOpen(false);
      }
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setSortDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Calculer les créations filtrées par les autres filtres (sans le filtre actuel)
  const getFilteredCreationsForStatus = () => {
    return creations.filter((c) => {
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
      return true;
    });
  };

  const getFilteredCreationsForType = () => {
    return creations.filter((c) => {
      if (statusFilter === "disponible" && c.sold) return false;
      if (statusFilter === "vendu" && !c.sold) return false;
      if (yarnBrandFilter === "sans marque") {
        if (c.yarnBrand && c.yarnBrand.trim() !== "") return false;
      } else if (yarnBrandFilter !== "toutes" && c.yarnBrand !== yarnBrandFilter) {
        return false;
      }
      if (colorFilter !== "toutes" && c.color !== colorFilter) {
        return false;
      }
      return true;
    });
  };

  const getFilteredCreationsForColor = () => {
    return creations.filter((c) => {
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
      return true;
    });
  };

  const getFilteredCreationsForYarnBrand = () => {
    return creations.filter((c) => {
      if (statusFilter === "disponible" && c.sold) return false;
      if (statusFilter === "vendu" && !c.sold) return false;
      if (typeFilter !== "tous" && c.type !== typeFilter) {
        return false;
      }
      if (colorFilter !== "toutes" && c.color !== colorFilter) {
        return false;
      }
      return true;
    });
  };

  const getStatusLabel = () => {
    const filtered = getFilteredCreationsForStatus();
    if (statusFilter === "tous") return `Statut (${filtered.length})`;
    if (statusFilter === "disponible") {
      const count = filtered.filter(c => !c.sold).length;
      return `Disponible (${count})`;
    }
    if (statusFilter === "vendu") {
      const count = filtered.filter(c => c.sold).length;
      return `Vendu (${count})`;
    }
    return "Statut";
  };

  const getYarnBrandLabel = () => {
    const filtered = getFilteredCreationsForYarnBrand();
    if (yarnBrandFilter === "toutes") return `Marque de fil (${filtered.length})`;
    if (yarnBrandFilter === "sans marque") {
      const count = filtered.filter(c => !c.yarnBrand || c.yarnBrand.trim() === "").length;
      return `Sans marque (${count})`;
    }
    const count = filtered.filter(c => c.yarnBrand === yarnBrandFilter).length;
    return `${yarnBrandFilter} (${count})`;
  };

  // Options disponibles pour chaque filtre en fonction des autres filtres
  const availableTypeOptions = Array.from(
    new Set(
      getFilteredCreationsForType()
        .map((c) => c.type?.trim())
        .filter((c): c is string => Boolean(c))
    )
  ).sort((a, b) => a.localeCompare(b, 'fr'));

  const availableColorOptions = Array.from(
    new Set(
      getFilteredCreationsForColor()
        .map((c) => c.color?.trim())
        .filter((c): c is string => Boolean(c))
    )
  ).sort((a, b) => {
    if (a.toLowerCase() === "multicolore") return 1;
    if (b.toLowerCase() === "multicolore") return -1;
    return a.localeCompare(b);
  });

  const availableYarnBrandOptions = Array.from(
    new Set(
      getFilteredCreationsForYarnBrand()
        .map((c) => c.yarnBrand?.trim())
        .filter((c): c is string => Boolean(c))
    )
  ).sort((a, b) => a.localeCompare(b, 'fr'));

  // Réinitialiser automatiquement les filtres si leur valeur n'est plus disponible
  useEffect(() => {
    if (typeFilter !== "tous" && !availableTypeOptions.includes(typeFilter)) {
      onTypeFilterChange("tous");
    }
  }, [availableTypeOptions, typeFilter, onTypeFilterChange]);

  useEffect(() => {
    if (colorFilter !== "toutes" && !availableColorOptions.includes(colorFilter)) {
      onColorFilterChange("toutes");
    }
  }, [availableColorOptions, colorFilter, onColorFilterChange]);

  useEffect(() => {
    if (yarnBrandFilter !== "toutes" && yarnBrandFilter !== "sans marque" && !availableYarnBrandOptions.includes(yarnBrandFilter)) {
      onYarnBrandFilterChange("toutes");
    }
  }, [availableYarnBrandOptions, yarnBrandFilter, onYarnBrandFilterChange]);

  const getTypeLabel = () => {
    const filtered = getFilteredCreationsForType();
    if (typeFilter === "tous") return `Type (${filtered.length})`;
    const count = filtered.filter(c => c.type === typeFilter).length;
    return `${typeFilter} (${count})`;
  };

  const getColorLabel = () => {
    const filtered = getFilteredCreationsForColor();
    if (colorFilter === "toutes") return `Couleur (${filtered.length})`;
    const count = filtered.filter(c => c.color === colorFilter).length;
    return `${colorFilter} (${count})`;
  };

  const hasActiveFilters = statusFilter !== "tous" || yarnBrandFilter !== "toutes" || typeFilter !== "tous" || colorFilter !== "toutes";

  const handleClearAll = () => {
    onStatusFilterChange("tous");
    onYarnBrandFilterChange("toutes");
    onTypeFilterChange("tous");
    onColorFilterChange("toutes");
  };

  return (
    <>
      {/* Barre de recherche */}
      <div className="mb-4">
        <Input
          type="text"
          placeholder="🔍 Rechercher par titre, couleur, type, prix ou marque de fil..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full"
        />
      </div>
      
      {/* Filtres regroupés en dropdowns */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Dropdown Statut */}
        <div className="relative" ref={statusDropdownRef}>
          <button
            type="button"
            onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
            className={`flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer ${
              statusFilter !== "tous" ? "border-slate-900" : "border-slate-200"
            }`}
          >
            <span>{getStatusLabel()}</span>
            <span className={`transition-transform ${statusDropdownOpen ? "rotate-180" : ""}`}>
              ▼
            </span>
          </button>

          {statusDropdownOpen && (() => {
            const filtered = getFilteredCreationsForStatus();
            const availableFiltered = filtered.filter(c => !c.sold).length;
            const soldFiltered = filtered.filter(c => c.sold).length;
            return (
              <div className="absolute left-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg animate-fadeIn">
                <div className="p-2">
                  <button
                    type="button"
                    onClick={() => {
                      onStatusFilterChange("tous");
                      setStatusDropdownOpen(false);
                    }}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                      statusFilter === "tous" ? "bg-slate-100 font-medium" : ""
                    }`}
                  >
                    Tous ({filtered.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onStatusFilterChange("disponible");
                      setStatusDropdownOpen(false);
                    }}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                      statusFilter === "disponible" ? "bg-slate-100 font-medium" : ""
                    }`}
                  >
                    ✅ Disponible ({availableFiltered})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onStatusFilterChange("vendu");
                      setStatusDropdownOpen(false);
                    }}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                      statusFilter === "vendu" ? "bg-slate-100 font-medium" : ""
                    }`}
                  >
                    ⚫ Vendu ({soldFiltered})
                  </button>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Dropdown Marque de fil */}
        <div className="relative" ref={yarnBrandDropdownRef}>
          <button
            type="button"
            onClick={() => setYarnBrandDropdownOpen(!yarnBrandDropdownOpen)}
            className={`flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer ${
              yarnBrandFilter !== "toutes" ? "border-slate-900" : "border-slate-200"
            }`}
          >
            <span>🧶 {getYarnBrandLabel()}</span>
            <span className={`transition-transform ${yarnBrandDropdownOpen ? "rotate-180" : ""}`}>
              ▼
            </span>
          </button>

          {yarnBrandDropdownOpen && (
            <div className="absolute left-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg animate-fadeIn">
              <div className="max-h-64 overflow-y-auto p-2">
                <button
                  type="button"
                  onClick={() => {
                    onYarnBrandFilterChange("toutes");
                    setYarnBrandDropdownOpen(false);
                  }}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                    yarnBrandFilter === "toutes" ? "bg-slate-100 font-medium" : ""
                  }`}
                >
                  Toutes ({getFilteredCreationsForYarnBrand().length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onYarnBrandFilterChange("sans marque");
                    setYarnBrandDropdownOpen(false);
                  }}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                    yarnBrandFilter === "sans marque" ? "bg-slate-100 font-medium" : ""
                  }`}
                >
                  Sans marque ({getFilteredCreationsForYarnBrand().filter(c => !c.yarnBrand || c.yarnBrand.trim() === "").length})
                </button>
                {availableYarnBrandOptions.map((brand) => {
                  const filtered = getFilteredCreationsForYarnBrand();
                  const count = filtered.filter(c => c.yarnBrand === brand).length;
                  return (
                    <button
                      key={brand}
                      type="button"
                      onClick={() => {
                        onYarnBrandFilterChange(brand);
                        setYarnBrandDropdownOpen(false);
                      }}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                        yarnBrandFilter === brand ? "bg-slate-100 font-medium" : ""
                      }`}
                    >
                      {brand} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Dropdown Type */}
        <div className="relative" ref={typeDropdownRef}>
          <button
            type="button"
            onClick={() => setTypeDropdownOpen(!typeDropdownOpen)}
            className={`flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer ${
              typeFilter !== "tous" ? "border-slate-900" : "border-slate-200"
            }`}
          >
            <span>🏷️ {getTypeLabel()}</span>
            <span className={`transition-transform ${typeDropdownOpen ? "rotate-180" : ""}`}>
              ▼
            </span>
          </button>

          {typeDropdownOpen && (
            <div className="absolute left-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg animate-fadeIn">
              <div className="max-h-64 overflow-y-auto p-2">
                <button
                  type="button"
                  onClick={() => {
                    onTypeFilterChange("tous");
                    setTypeDropdownOpen(false);
                  }}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                    typeFilter === "tous" ? "bg-slate-100 font-medium" : ""
                  }`}
                >
                  Tous ({getFilteredCreationsForType().length})
                </button>
                {availableTypeOptions.map((type) => {
                  const filtered = getFilteredCreationsForType();
                  const count = filtered.filter(c => c.type === type).length;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        onTypeFilterChange(type);
                        setTypeDropdownOpen(false);
                      }}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                        typeFilter === type ? "bg-slate-100 font-medium" : ""
                      }`}
                    >
                      {type} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Dropdown Couleur */}
        <div className="relative" ref={colorDropdownRef}>
          <button
            type="button"
            onClick={() => setColorDropdownOpen(!colorDropdownOpen)}
            className={`flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer ${
              colorFilter !== "toutes" ? "border-slate-900" : "border-slate-200"
            }`}
          >
            <span>🎨 {getColorLabel()}</span>
            <span className={`transition-transform ${colorDropdownOpen ? "rotate-180" : ""}`}>
              ▼
            </span>
          </button>

          {colorDropdownOpen && (
            <div className="absolute left-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg animate-fadeIn">
              <div className="max-h-64 overflow-y-auto p-2">
                <button
                  type="button"
                  onClick={() => {
                    onColorFilterChange("toutes");
                    setColorDropdownOpen(false);
                  }}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                    colorFilter === "toutes" ? "bg-slate-100 font-medium" : ""
                  }`}
                >
                  Toutes ({getFilteredCreationsForColor().length})
                </button>
                {availableColorOptions.map((color) => {
                  const filtered = getFilteredCreationsForColor();
                  const count = filtered.filter(c => c.color === color).length;
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => {
                        onColorFilterChange(color);
                        setColorDropdownOpen(false);
                      }}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                        colorFilter === color ? "bg-slate-100 font-medium" : ""
                      }`}
                    >
                      {color} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Dropdown Tri par date */}
        <div className="relative" ref={sortDropdownRef}>
          <button
            type="button"
            onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <span>
              📅 {sortByDate === "custom" ? "Ordre personnalisé" : sortByDate === "desc" ? "Plus récent au plus ancien" : "Plus ancien au plus récent"}
            </span>
            <span className={`transition-transform ${sortDropdownOpen ? "rotate-180" : ""}`}>
              ▼
            </span>
          </button>

          {sortDropdownOpen && (
            <div className="absolute left-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg animate-fadeIn">
              <div className="p-2">
                <button
                  type="button"
                  onClick={() => {
                    onSortByDateChange("custom");
                    setSortDropdownOpen(false);
                  }}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                    sortByDate === "custom" ? "bg-slate-100 font-medium" : ""
                  }`}
                >
                  📅 Ordre personnalisé
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSortByDateChange("desc");
                    setSortDropdownOpen(false);
                  }}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                    sortByDate === "desc" ? "bg-slate-100 font-medium" : ""
                  }`}
                >
                  📅 Plus récent au plus ancien
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSortByDateChange("asc");
                    setSortDropdownOpen(false);
                  }}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                    sortByDate === "asc" ? "bg-slate-100 font-medium" : ""
                  }`}
                >
                  📅 Plus ancien au plus récent
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bouton effacer tous les filtres */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClearAll}
            className="ml-auto cursor-pointer rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Effacer tous les filtres
          </button>
        )}
      </div>
    </>
  );
}

