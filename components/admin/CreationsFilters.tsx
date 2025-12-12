"use client";

import { Button, Input } from "@/components";

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
}: CreationsFiltersProps) {
  return (
    <>
      {/* Barre de recherche */}
      <div className="mb-4">
        <Input
          type="text"
          placeholder="🔍 Rechercher par titre, couleur, type, prix ou marque de laine..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full"
        />
      </div>
      
      {/* Filtres de statut */}
      <div className="flex flex-wrap gap-2 mb-4 pb-4 pt-2 border-b border-slate-200">
        <Button
          size="sm"
          variant={statusFilter === "tous" ? "primary" : "secondary"}
          onClick={() => onStatusFilterChange("tous")}
          className="cursor-pointer"
        >
          Tous ({totalCount})
        </Button>
        <Button
          size="sm"
          variant={statusFilter === "disponible" ? "primary" : "secondary"}
          onClick={() => onStatusFilterChange("disponible")}
          className="cursor-pointer"
        >
          ✅ Disponible ({availableCount})
        </Button>
        <Button
          size="sm"
          variant={statusFilter === "vendu" ? "primary" : "secondary"}
          onClick={() => onStatusFilterChange("vendu")}
          className="cursor-pointer"
        >
          ⚫ Vendu ({soldCount})
        </Button>
      </div>

      {/* Filtre par marque de laine */}
      {yarnBrandOptions.length > 0 && (
        <div className="mb-4 pb-4 pt-2 border-b border-slate-200">
          <label className="text-xs font-medium text-slate-700 mb-2 block">
            🧶 Filtrer par marque de laine
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={yarnBrandFilter === "toutes" ? "primary" : "secondary"}
              onClick={() => onYarnBrandFilterChange("toutes")}
              className="cursor-pointer"
            >
              Toutes ({totalCount})
            </Button>
            {yarnBrandOptions.map((brand) => {
              const count = creations.filter(c => c.yarnBrand === brand).length;
              return (
                <Button
                  key={brand}
                  size="sm"
                  variant={yarnBrandFilter === brand ? "primary" : "secondary"}
                  onClick={() => onYarnBrandFilterChange(brand)}
                  className="cursor-pointer"
                >
                  {brand} ({count})
                </Button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

