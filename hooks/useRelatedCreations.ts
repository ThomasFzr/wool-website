"use client";

import { useEffect, useState } from "react";
import type { CartItem } from "@/contexts/CartContext";

export type RelatedCreation = {
  _id: string;
  slug?: string;
  title: string;
  imageUrl?: string;
  images?: string[];
  price?: number;
  color?: string;
  type?: string;
  sold?: boolean;
};

/**
 * Récupère en UN seul appel les articles liés aux articles du panier.
 * L'effet dépend de la liste d'ids jointe (pas de l'identité du tableau items).
 */
export function useRelatedCreations(items: CartItem[], enabled: boolean = true) {
  const [relatedCreations, setRelatedCreations] = useState<RelatedCreation[]>([]);
  const ids = items.map((item) => item.creationId).join(",");

  useEffect(() => {
    if (!enabled || !ids) {
      setRelatedCreations([]);
      return;
    }

    let cancelled = false;

    fetch(`/api/creations/related?ids=${encodeURIComponent(ids)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) {
          setRelatedCreations(Array.isArray(data) ? data : []);
        }
      })
      .catch((err) => {
        console.error("Erreur lors de la récupération des articles liés:", err);
        if (!cancelled) {
          setRelatedCreations([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ids, enabled]);

  return relatedCreations;
}
