"use client";

import { Card, Button } from "@/components";
import { CreationsFilters } from "./CreationsFilters";
import { CreationListItem } from "./CreationListItem";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";

type Creation = {
  _id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  price?: number;
  color?: string;
  type?: "bonnet" | "tour de cou" | "bandeau";
  sold?: boolean;
  yarnBrand?: string;
  weight?: number;
  yarnPrice?: number;
};

interface CreationsListProps {
  creations: Creation[];
  filteredCreations: Creation[];
  loadingList: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: string;
  onStatusFilterChange: (filter: string) => void;
  yarnBrandFilter: string;
  onYarnBrandFilterChange: (filter: string) => void;
  yarnBrandOptions: string[];
  sortByDate: "custom" | "asc" | "desc";
  onSortByDateChange: (sort: "custom" | "asc" | "desc") => void;
  onEdit: (creation: Creation) => void;
  onDelete: (id: string) => void;
  onViewDetails: (creation: Creation) => void;
  onMakeAvailable: (id: string) => void;
  onReorder: (newCreations: Creation[]) => void;
  onSaveOrder: () => void;
  savingOrder: boolean;
}

export function CreationsList({
  creations,
  filteredCreations,
  loadingList,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  yarnBrandFilter,
  onYarnBrandFilterChange,
  yarnBrandOptions,
  sortByDate,
  onSortByDateChange,
  onEdit,
  onDelete,
  onViewDetails,
  onMakeAvailable,
  onReorder,
  onSaveOrder,
  savingOrder,
}: CreationsListProps) {
  // Pour le drag & drop, on utilise toutes les créations (pas seulement les filtrées)
  // car on veut réorganiser l'ordre global
  const {
    dragIndex,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useDragAndDrop(creations, onReorder);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          📦 Créations existantes ({creations.length})
        </h2>
        {creations.length > 1 && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onSaveOrder}
            disabled={savingOrder}
            className="cursor-pointer"
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
        <>
          <p className="text-xs text-slate-500 mb-3">
            💡 Glissez les créations pour réorganiser l&apos;ordre d&apos;affichage sur la page d&apos;accueil
          </p>
          
          <CreationsFilters
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            statusFilter={statusFilter}
            onStatusFilterChange={onStatusFilterChange}
            yarnBrandFilter={yarnBrandFilter}
            onYarnBrandFilterChange={onYarnBrandFilterChange}
            totalCount={creations.length}
            availableCount={creations.filter(c => !c.sold).length}
            soldCount={creations.filter(c => c.sold).length}
            yarnBrandOptions={yarnBrandOptions}
            creations={creations}
            sortByDate={sortByDate}
            onSortByDateChange={onSortByDateChange}
          />
        </>
      )}

      <div className="space-y-2">
        {filteredCreations.map((c, index) => (
          <CreationListItem
            key={c._id}
            creation={c}
            index={index}
            dragIndex={dragIndex}
            onEdit={onEdit}
            onDelete={onDelete}
            onViewDetails={onViewDetails}
            onMakeAvailable={onMakeAvailable}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />
        ))}
      </div>
    </Card>
  );
}

