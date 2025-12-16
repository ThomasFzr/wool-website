"use client";

import { Button, Badge } from "@/components";

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

interface CreationListItemProps {
  creation: Creation;
  index: number;
  dragIndex: number | null;
  isDragEnabled: boolean;
  onEdit: (creation: Creation) => void;
  onDelete: (id: string) => void;
  onViewDetails: (creation: Creation) => void;
  onMakeAvailable: (id: string) => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
  onDragEnd: () => void;
  onTouchStart: (index: number) => void;
  onTouchMove: (e: React.TouchEvent<HTMLDivElement>) => void;
  onTouchEnd: () => void;
}

export function CreationListItem({
  creation,
  index,
  dragIndex,
  isDragEnabled,
  onEdit,
  onDelete,
  onViewDetails,
  onMakeAvailable,
  onDragStart,
  onDragOver,
  onDragEnd,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: CreationListItemProps) {
  return (
    <div
      key={creation._id}
      data-creation-index={index}
      data-creation-id={creation._id}
      onDragOver={isDragEnabled ? (e) => {
        e.preventDefault();
        e.stopPropagation();
        onDragOver(e, index);
      } : undefined}
      onDrop={isDragEnabled ? (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Le réordonnancement est déjà fait dans onDragOver
      } : undefined}
      className={`relative flex flex-col gap-3 rounded-xl border bg-white p-3 sm:p-4 transition hover:shadow-sm sm:flex-row sm:items-center sm:justify-between ${
        dragIndex === index
          ? "border-blue-500 ring-2 ring-blue-200 opacity-50"
          : "border-slate-200"
      }`}
    >
      {/* Conteneur principal avec poignée à gauche */}
      <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
        {/* Poignée de drag */}
        {isDragEnabled && (
          <div
            draggable={true}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", "");
              onDragStart(index);
            }}
            onDragEnd={(e) => {
              e.preventDefault();
              onDragEnd();
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              onTouchStart(index);
            }}
            onTouchMove={(e) => {
              e.stopPropagation();
              onTouchMove(e);
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              onTouchEnd();
            }}
            className="flex shrink-0 items-center justify-center px-1.5 py-2 cursor-grab active:cursor-grabbing touch-none hover:bg-slate-50 rounded-lg transition-colors select-none sm:px-2"
            style={{ touchAction: "none" }}
            title="Glisser pour réorganiser"
          >
            <div className="flex items-center gap-0.5">
              <div className="flex flex-col gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-slate-400"></div>
                <div className="h-1.5 w-1.5 rounded-full bg-slate-400"></div>
                <div className="h-1.5 w-1.5 rounded-full bg-slate-400"></div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-slate-400"></div>
                <div className="h-1.5 w-1.5 rounded-full bg-slate-400"></div>
                <div className="h-1.5 w-1.5 rounded-full bg-slate-400"></div>
              </div>
            </div>
          </div>
        )}

        {/* Numéro d'ordre */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-600">
          {index + 1}
        </div>
        {creation.imageUrl && (
          <div className="relative shrink-0">
            {creation.sold && (
              <span className="absolute left-1 top-1 z-10 rounded-full bg-slate-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                Vendu
              </span>
            )}
            <img
              src={creation.imageUrl}
              alt={creation.title}
              className="h-16 w-16 rounded-lg object-cover sm:h-20 sm:w-20"
              draggable={false}
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-slate-900 break-words">
              {creation.title}
            </span>
            {creation.price != null && (
              <Badge variant="default" className="shrink-0">{creation.price} €</Badge>
            )}
          </div>
          {creation.description && (
            <p className="text-xs text-slate-600 line-clamp-2 mb-2 sm:line-clamp-3">
              {creation.description}
            </p>
          )}
          {/* Informations admin */}
          {(creation.yarnBrand || creation.weight || creation.yarnPrice) && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 sm:gap-2">
              {creation.yarnBrand && (
                <span className="px-2 py-1 rounded bg-slate-100 whitespace-nowrap">
                  🧶 {creation.yarnBrand}
                </span>
              )}
              {creation.weight != null && (
                <span className="px-2 py-1 rounded bg-slate-100 whitespace-nowrap">
                  ⚖️ {creation.weight} g
                </span>
              )}
              {creation.yarnPrice != null && (
                <span className="px-2 py-1 rounded bg-slate-100 whitespace-nowrap">
                  💰 {creation.yarnPrice} €/100g
                </span>
              )}
              {creation.weight != null && creation.yarnPrice != null && (
                <span className="px-2 py-1 rounded bg-slate-100 font-semibold whitespace-nowrap">
                  💵 {((creation.weight / 100) * creation.yarnPrice).toFixed(2)} €
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Boutons d'action */}
      <div className="flex items-center gap-2 sm:shrink-0 flex-wrap sm:flex-nowrap">
        {creation.sold && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onMakeAvailable(creation._id)}
            title="Remettre disponible"
            className="bg-green-600 hover:bg-green-700 cursor-pointer text-xs sm:text-sm"
          >
            <span className="hidden sm:inline">↻ Disponible</span>
            <span className="sm:hidden">↻</span>
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onViewDetails(creation)}
          className="cursor-pointer flex items-center justify-center p-2"
          title="Voir les détails"
        >
          <svg
            className="h-4 w-4 sm:h-5 sm:w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onEdit(creation)}
          className="cursor-pointer text-xs sm:text-sm"
        >
          <span className="hidden sm:inline">✏️ Modifier</span>
          <span className="sm:hidden">✏️</span>
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => onDelete(creation._id)}
          className="cursor-pointer p-2"
          title="Supprimer"
        >
          🗑️
        </Button>
      </div>
    </div>
  );
}

