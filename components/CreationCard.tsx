import { Badge } from "./ui";
import { optimizeCloudinaryUrl } from "@/lib/imageOptimizer";

export type Creation = {
  _id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  images?: string[];
  price?: number;
  color?: string;
  type?: "bonnet" | "tour de cou" | "bandeau";
  reserved?: boolean;
  sold?: boolean;
  showAsNew?: boolean;
  createdAt?: string;
};

interface CreationCardProps {
  creation: Creation;
  onClick: () => void;
  priority?: boolean;
}

export function CreationCard({ creation, onClick, priority = false }: CreationCardProps) {
  const images = creation.images && creation.images.length > 0 
    ? creation.images 
    : creation.imageUrl 
      ? [creation.imageUrl] 
      : [];
  
  // Optimiser pour l'affichage carte (500px max pour mobile)
  const cover = images[0] ? optimizeCloudinaryUrl(images[0], {
    width: 500,
    quality: priority ? 80 : 70,
    format: 'auto'
  }) : undefined;

  // Vérifier si l'article est nouveau (moins de 7 jours)
  const isNewArticle = creation.showAsNew && creation.createdAt 
    ? (new Date().getTime() - new Date(creation.createdAt).getTime()) / (1000 * 60 * 60 * 24) < 7
    : creation.showAsNew;

  // Précharger toutes les images au survol avec les mêmes optimisations que la modale
  const handleMouseEnter = () => {
    images.forEach((src) => {
      const img = document.createElement('img');
      img.src = optimizeCloudinaryUrl(src, { width: 800, quality: 80, format: 'auto' });
    });
  };

  return (
    <article
      className="relative flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-1 hover:shadow-md"
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
    >
      {creation.sold ? (
        <span className="absolute left-2 top-2 z-10 rounded-full bg-slate-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
          Vendu
        </span>
      ) : creation.reserved ? (
        <span className="absolute left-2 top-2 z-10 rounded-full bg-red-500 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
          Réservé
        </span>
      ) : isNewArticle ? (
        <span className="absolute left-2 top-2 z-10 rounded-full bg-red-500 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
          Nouveau
        </span>
      ) : null}

      <div className="relative h-56 w-full overflow-hidden bg-slate-100">
        {cover ? (
          <img
            src={cover}
            alt={creation.title}
            width={600}
            height={450}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "low"}
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
            Pas d&apos;image
          </div>
        )}
        {images.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            {images.length} photos
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">
            {creation.title}
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            {creation.price != null && (
              <Badge variant="default" className="whitespace-nowrap">
                {creation.price} €
              </Badge>
            )}
          </div>
        </div>

        {creation.description && (
          <p className="line-clamp-3 whitespace-pre-line text-xs text-slate-600">
            {creation.description}
          </p>
        )}
      </div>
    </article>
  );
}
