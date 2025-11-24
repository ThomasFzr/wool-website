import { Badge } from "./ui";

export type Creation = {
  _id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  images?: string[];
  price?: number;
  color?: string;
  reserved?: boolean;
  sold?: boolean;
};

interface CreationCardProps {
  creation: Creation;
  onClick: () => void;
}

export function CreationCard({ creation, onClick }: CreationCardProps) {
  const images = creation.images && creation.images.length > 0 
    ? creation.images 
    : creation.imageUrl 
      ? [creation.imageUrl] 
      : [];
  
  const cover = images[0];

  return (
    <article
      className="relative flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-1 hover:shadow-md"
      onClick={onClick}
    >
      {creation.sold ? (
        <span className="absolute left-2 top-2 z-10 rounded-full bg-slate-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
          Vendu
        </span>
      ) : creation.reserved ? (
        <span className="absolute left-2 top-2 z-10 rounded-full bg-red-500 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
          Réservé
        </span>
      ) : null}

      <div className="relative h-56 w-full overflow-hidden bg-slate-100">
        {cover ? (
          <img
            src={cover}
            alt={creation.title}
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
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">
            {creation.title}
          </h2>
          <div className="flex items-center gap-2">
            {creation.price != null && (
              <Badge variant="default">
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
