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
  creations: Array<{ yarnBrand?: string }>;
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
  sortByDate,
  onSortByDateChange,
}: CreationsFiltersProps) {
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [yarnBrandDropdownOpen, setYarnBrandDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);
  const yarnBrandDropdownRef = useRef<HTMLDivElement | null>(null);
  const sortDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
      if (yarnBrandDropdownRef.current && !yarnBrandDropdownRef.current.contains(e.target as Node)) {
        setYarnBrandDropdownOpen(false);
      }
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setSortDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const getStatusLabel = () => {
    if (statusFilter === "tous") return `Statut (${totalCount})`;
    if (statusFilter === "disponible") return `Disponible (${availableCount})`;
    if (statusFilter === "vendu") return `Vendu (${soldCount})`;
    return "Statut";
  };

  const getYarnBrandLabel = () => {
    if (yarnBrandFilter === "toutes") return `Marque de fil (${totalCount})`;
    if (yarnBrandFilter === "sans marque") {
      const count = creations.filter(c => !c.yarnBrand || c.yarnBrand.trim() === "").length;
      return `Sans marque (${count})`;
    }
    const count = creations.filter(c => c.yarnBrand === yarnBrandFilter).length;
    return `${yarnBrandFilter} (${count})`;
  };

  const hasActiveFilters = statusFilter !== "tous" || yarnBrandFilter !== "toutes";

  const handleClearAll = () => {
    onStatusFilterChange("tous");
    onYarnBrandFilterChange("toutes");
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
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <span>{getStatusLabel()}</span>
            <span className={`transition-transform ${statusDropdownOpen ? "rotate-180" : ""}`}>
              ▼
            </span>
          </button>

          {statusDropdownOpen && (
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
                  Tous ({totalCount})
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
                  ✅ Disponible ({availableCount})
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
                  ⚫ Vendu ({soldCount})
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Dropdown Marque de fil */}
        <div className="relative" ref={yarnBrandDropdownRef}>
          <button
            type="button"
            onClick={() => setYarnBrandDropdownOpen(!yarnBrandDropdownOpen)}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
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
                  Toutes ({totalCount})
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
                  Sans marque ({creations.filter(c => !c.yarnBrand || c.yarnBrand.trim() === "").length})
                </button>
                {yarnBrandOptions.map((brand) => {
                  const count = creations.filter(c => c.yarnBrand === brand).length;
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

