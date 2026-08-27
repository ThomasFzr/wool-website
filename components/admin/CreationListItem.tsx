"use client";

import { Button, Badge } from "@/components";
import { optimizeCloudinaryUrl } from "@/lib/imageOptimizer";

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

interface CreationListItemProps {
  creation: Creation;
  index: number;
  dragIndex: number | null;
  isDragEnabled: boolean;
  onEdit: (creation: Creation) => void;
  onDelete: (id: string) => void;
  onDuplicate: (creation: Creation) => void;
  onViewDetails: (creation: Creation) => void;
  onToggleSold: (id: string, currentSoldStatus: boolean) => void;
  onToggleHidden: (id: string, hidden: boolean) => void;
  onToggleNew: (id: string, showAsNew: boolean) => void;
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
  onDuplicate,
  onViewDetails,
  onToggleSold,
  onToggleHidden,
  onToggleNew,
  onDragStart,
  onDragOver,
  onDragEnd,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: CreationListItemProps) {
  // Badge "Nouveau" uniquement si showAsNew ET dans la fenêtre des 7 jours (visibleAt ou createdAt)
  const refDate = creation.visibleAt || creation.createdAt;
  const isWithinNewPeriod = creation.showAsNew && refDate
    ? (new Date().getTime() - new Date(refDate).getTime()) / (1000 * 60 * 60 * 24) < 7
    : false;

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
      <div className="flex items-start sm:items-center gap-2 sm:gap-3 flex-1 min-w-0">
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
            {creation.hidden && (
              <span className="absolute right-1 top-1 z-10 rounded-full bg-amber-600 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                Caché
              </span>
            )}
            {creation.showAsNew && !creation.hidden && !creation.sold && isWithinNewPeriod && (
              <span className="absolute right-1 top-1 z-10 rounded-full bg-red-600 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                Nouveau
              </span>
            )}
            <img
              src={optimizeCloudinaryUrl(creation.imageUrl, { width: 200 })}
              alt={creation.title}
              title={creation.title}
              className={`h-16 w-16 rounded-lg object-cover sm:h-20 sm:w-20 ${
                creation.hidden ? "opacity-50" : ""
              }`}
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
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onToggleHidden(creation._id, !creation.hidden)}
          title={creation.hidden ? "Afficher l'article" : "Cacher l'article"}
          className={`cursor-pointer text-xs sm:text-sm ${
            creation.hidden 
              ? "bg-amber-100 hover:bg-amber-200 text-amber-900" 
              : "bg-slate-100 hover:bg-slate-200 text-slate-700"
          }`}
        >
          <span className="hidden sm:inline">
            {creation.hidden ? "👁️ Afficher" : "🙈 Cacher"}
          </span>
          <span className="sm:hidden">
            {creation.hidden ? "👁️" : "🙈"}
          </span>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onToggleNew(creation._id, !creation.showAsNew)}
          title={creation.showAsNew ? "Retirer le badge Nouveau" : "Marquer comme nouveau"}
          className={`cursor-pointer text-xs sm:text-sm ${
            creation.showAsNew
              ? "bg-red-100 hover:bg-red-200 text-red-900"
              : "bg-slate-100 hover:bg-slate-200 text-slate-700"
          }`}
        >
          <span className="hidden sm:inline">
            {creation.showAsNew ? "✨ Retirer nouveau" : "✨ Nouveau"}
          </span>
          <span className="sm:hidden">
            {creation.showAsNew ? "✨" : "✨"}
          </span>
        </Button>
        <Button
          variant={creation.sold ? "primary" : "secondary"}
          size="sm"
          onClick={() => onToggleSold(creation._id, creation.sold || false)}
          title={creation.sold ? "Remettre disponible" : "Marquer comme vendu"}
          className={`cursor-pointer text-xs sm:text-sm ${
            creation.sold 
              ? "bg-green-600 hover:bg-green-700 text-white" 
              : "bg-red-100 hover:bg-red-200 text-red-900"
          }`}
        >
          <span className="hidden sm:inline">
            {creation.sold ? "↻ Disponible" : "✓ Vendu"}
          </span>
          <span className="sm:hidden">
            {creation.sold ? "↻" : "✓"}
          </span>
        </Button>
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
          variant="secondary"
          size="sm"
          onClick={() => onDuplicate(creation)}
          className="cursor-pointer p-2"
          title="Dupliquer"
        >
          📋
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

