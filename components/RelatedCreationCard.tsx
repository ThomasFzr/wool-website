"use client";

import Link from "next/link";
import { Button } from "@/components/ui";
import { optimizeCloudinaryUrl } from "@/lib/imageOptimizer";
import { useCart } from "@/contexts/CartContext";
import type { RelatedCreation } from "@/hooks/useRelatedCreations";

type RelatedCreationCardProps = {
  related: RelatedCreation;
  /** Appelé lors d'un clic sur le lien vers la création (ex: fermer la modale) */
  onNavigate?: () => void;
};

/**
 * Carte "Vous pourriez aussi aimer" partagée entre la page panier et la modale panier.
 */
export function RelatedCreationCard({ related, onNavigate }: RelatedCreationCardProps) {
  const { items, addItem } = useCart();

  const imageUrl = related.images?.[0] || related.imageUrl;
  const optimizedImage = imageUrl
    ? optimizeCloudinaryUrl(imageUrl, {
        width: 200,
        quality: 70,
        format: "auto",
      })
    : undefined;
  const isInCart = items.some((item) => item.creationId === related._id);

  return (
    <div className="flex gap-4 rounded-lg border border-slate-200 p-4">
      <Link
        href={`/creations/${related.slug || related._id}`}
        onClick={onNavigate}
        className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100"
      >
        {optimizedImage ? (
          <img
            src={optimizedImage}
            alt={related.title}
            title={related.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
            Pas d&apos;image
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <Link
              href={`/creations/${related.slug || related._id}`}
              onClick={onNavigate}
              className="text-sm font-semibold text-slate-900 hover:text-slate-700"
            >
              {related.title}
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900">
            {related.price != null ? `${related.price.toFixed(2)} €` : "—"}
          </p>
          <Button
            size="sm"
            onClick={() => {
              if (!isInCart) {
                addItem({
                  creationId: related._id,
                  slug: related.slug,
                  title: related.title,
                  imageUrl: imageUrl,
                  price: related.price,
                });
              }
            }}
            disabled={isInCart}
            className="cursor-pointer"
            variant={isInCart ? "secondary" : "primary"}
          >
            {isInCart ? "✓ Ajouté" : "+ Ajouter"}
          </Button>
        </div>
      </div>
    </div>
  );
}
