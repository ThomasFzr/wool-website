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
  hidden?: boolean;
  showAsNew?: boolean;
  visibleAt?: string;
  createdAt?: string;
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
  typeFilter: string;
  onTypeFilterChange: (filter: string) => void;
  typeOptions: string[];
  colorFilter: string;
  onColorFilterChange: (filter: string) => void;
  colorOptions: string[];
  sortByDate: "custom" | "asc" | "desc";
  onSortByDateChange: (sort: "custom" | "asc" | "desc") => void;
  onEdit: (creation: Creation) => void;
  onDelete: (id: string) => void;
  onDuplicate: (creation: Creation) => void;
  onViewDetails: (creation: Creation) => void;
  onToggleSold: (id: string, currentSoldStatus: boolean) => void;
  onToggleHidden: (id: string, hidden: boolean) => void;
  onToggleNew: (id: string, showAsNew: boolean) => void;
  onReorder: (newCreations: Creation[]) => void;
  onSaveOrder: () => void;
  savingOrder: boolean;
  hasOrderChanged: boolean;
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
  typeFilter,
  onTypeFilterChange,
  typeOptions,
  colorFilter,
  onColorFilterChange,
  colorOptions,
  sortByDate,
  onSortByDateChange,
  onEdit,
  onDelete,
  onDuplicate,
  onViewDetails,
  onToggleSold,
  onToggleHidden,
  onToggleNew,
  onReorder,
  onSaveOrder,
  savingOrder,
  hasOrderChanged,
}: CreationsListProps) {
  // Pour le drag & drop, on utilise toutes les créations (pas seulement les filtrées)
  // car on veut réorganiser l'ordre global
  // Le drag and drop ne fonctionne que si on est en mode "custom" (tri personnalisé)
  const {
    dragIndex,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useDragAndDrop(creations, onReorder);
  
  const isDragEnabled = sortByDate === "custom";

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base sm:text-lg font-semibold text-slate-900">
          📦 Créations existantes ({creations.length})
        </h2>
      </div>

      {/* Bouton pour sauvegarder l'ordre - en bas à droite */}
      {creations.length > 1 && hasOrderChanged && (
        <div className="fixed bottom-6 right-6 z-50 animate-[slideUp_0.3s_ease-out] sm:bottom-8 sm:right-8">
          <button
            onClick={onSaveOrder}
            disabled={savingOrder}
            className="group flex items-center gap-3 rounded-xl border-2 border-slate-900 bg-white px-5 py-4 text-slate-900 shadow-xl transition-all hover:bg-slate-900 hover:text-white hover:shadow-2xl hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-white disabled:hover:text-slate-900 cursor-pointer sm:px-7 sm:py-5"
          >
            {savingOrder ? (
              <>
                <svg
                  className="h-6 w-6 animate-spin text-slate-900 group-hover:text-white sm:h-7 sm:w-7"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span className="text-base font-bold sm:text-lg">
                  Sauvegarde...
                </span>
              </>
            ) : (
              <>
                <svg
                  className="h-6 w-6 text-slate-900 group-hover:text-white transition-colors sm:h-7 sm:w-7"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
                <span className="text-base font-bold sm:text-lg">
                  Sauvegarder l'ordre
                </span>
                <svg
                  className="h-5 w-5 text-slate-900 group-hover:text-white transition-colors sm:h-6 sm:w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </>
            )}
          </button>
        </div>
      )}

      {loadingList && (
        <p className="text-sm text-slate-500">Chargement...</p>
      )}

      {!loadingList && creations.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-8">
          Aucune création pour l&apos;instant. Créez-en une ci-dessus !
        </p>
      )}

      {creations.length > 1 && isDragEnabled && (
        <>
          <p className="text-xs text-slate-500 mb-3 sm:mb-4">
            💡 Utilisez les points à gauche des créations pour glisser et réorganiser l&apos;ordre d&apos;affichage sur la page d&apos;accueil
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
            typeFilter={typeFilter}
            onTypeFilterChange={onTypeFilterChange}
            typeOptions={typeOptions}
            colorFilter={colorFilter}
            onColorFilterChange={onColorFilterChange}
            colorOptions={colorOptions}
            sortByDate={sortByDate}
            onSortByDateChange={onSortByDateChange}
          />
        </>
      )}

      <div 
        className="space-y-2 sm:space-y-3"
        onTouchMove={handleTouchMove}
      >
        {filteredCreations.map((c, filteredIndex) => {
          // Trouver l'index réel dans la liste complète (creations)
          const realIndex = creations.findIndex((creation) => creation._id === c._id);
          // Si la création n'est pas trouvée (ne devrait pas arriver), utiliser l'index filtré
          const index = realIndex >= 0 ? realIndex : filteredIndex;
          // Utiliser une clé composite pour forcer le re-render lors du changement d'ordre
          return (
            <CreationListItem
              key={c._id}
              creation={c}
              index={index}
              dragIndex={dragIndex}
              isDragEnabled={isDragEnabled}
              onEdit={onEdit}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onViewDetails={onViewDetails}
              onToggleSold={onToggleSold}
              onToggleHidden={onToggleHidden}
              onToggleNew={onToggleNew}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
          );
        })}
      </div>
    </Card>
  );
}

