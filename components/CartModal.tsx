"use client";

import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui";
import { optimizeCloudinaryUrl } from "@/lib/imageOptimizer";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";

type RelatedCreation = {
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

export function CartModal() {
  const {
    items,
    isOpen,
    closeCart,
    removeItem,
    getTotalPrice,
    addItem,
  } = useCart();
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [relatedCreations, setRelatedCreations] = useState<RelatedCreation[]>([]);

  const totalPrice = getTotalPrice();

  // Récupérer les articles liés des articles dans le panier
  useEffect(() => {
    if (items.length === 0 || !isOpen) {
      setRelatedCreations([]);
      return;
    }

    async function fetchRelatedCreations() {
      try {
        // Récupérer tous les articles liés des articles du panier
        const allRelatedIds = new Set<string>();
        const cartItemIds = items.map(item => item.creationId);

        // Pour chaque article du panier, récupérer ses articles liés
        const promises = cartItemIds.map(async (id) => {
          try {
            const res = await fetch(`/api/creations/${id}`);
            if (res.ok) {
              const creation = await res.json();
              if (creation.relatedCreations && Array.isArray(creation.relatedCreations)) {
                creation.relatedCreations.forEach((related: any) => {
                  const relatedId = typeof related === 'string' ? related : related._id;
                  // Exclure les articles déjà dans le panier
                  if (relatedId && !cartItemIds.includes(relatedId)) {
                    allRelatedIds.add(relatedId);
                  }
                });
              }
            }
          } catch (err) {
            console.error('Erreur lors de la récupération des articles liés:', err);
          }
        });

        await Promise.all(promises);

        // Récupérer les détails des articles liés
        if (allRelatedIds.size > 0) {
          const relatedArray = Array.from(allRelatedIds).slice(0, 4); // Limiter à 4 articles
          const relatedPromises = relatedArray.map(async (id): Promise<RelatedCreation | null> => {
            try {
              const res = await fetch(`/api/creations/${id}`);
              if (res.ok) {
                const creation = await res.json();
                // Vérifier que l'article n'est pas vendu
                if (!creation.sold) {
                  return {
                    _id: creation._id,
                    slug: creation.slug,
                    title: creation.title,
                    imageUrl: creation.imageUrl,
                    images: creation.images,
                    price: creation.price,
                    color: creation.color,
                    type: creation.type,
                    sold: creation.sold,
                  } as RelatedCreation;
                }
              }
            } catch (err) {
              console.error('Erreur lors de la récupération de l\'article:', err);
            }
            return null;
          });

          const related = await Promise.all(relatedPromises);
          const validRelated: RelatedCreation[] = related.filter((item): item is RelatedCreation => {
            return item !== null && item !== undefined;
          });
          setRelatedCreations(validRelated);
        } else {
          setRelatedCreations([]);
        }
      } catch (err) {
        console.error('Erreur lors de la récupération des articles liés:', err);
        setRelatedCreations([]);
      }
    }

    fetchRelatedCreations();
  }, [items, isOpen]);

  // Détecter si on est sur mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);


  // Gérer l'animation de fermeture
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      closeCart();
      setIsClosing(false);
    }, 300); // Durée de l'animation
  }, [closeCart]);

  // Empêcher le scroll du body quand la modale est ouverte
  useEffect(() => {
    if (isOpen && !isMobile) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, isMobile]);

  // Fermer avec la touche Escape
  useEffect(() => {
    if (!isOpen) return;
    
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleClose();
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, handleClose]);

  const handleGoToCart = () => {
    handleClose();
    router.push("/cart");
  };

  // Ne pas afficher la modale sur mobile
  if (isMobile) return null;

  // Ne pas rendre si jamais ouvert sur desktop
  if (!isOpen && !isClosing) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${
          isClosing ? "opacity-0" : "opacity-100"
        }`}
        onClick={handleClose}
      />

      {/* Modale */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto bg-white shadow-xl will-change-transform ${
          isClosing
            ? "animate-[slideOutRight_300ms_ease-out]"
            : "animate-[slideInRight_300ms_ease-out]"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Panier</h2>
            <button
              onClick={handleClose}
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
              aria-label="Fermer le panier"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Contenu */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <svg
                  className="h-16 w-16 text-slate-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                <p className="mt-4 text-sm text-slate-600">
                  Votre panier est vide
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item) => {
                  const imageUrl = item.imageUrl
                    ? optimizeCloudinaryUrl(item.imageUrl, {
                        width: 200,
                        quality: 70,
                        format: "auto",
                      })
                    : undefined;

                  return (
                    <div
                      key={item.creationId}
                      className="flex gap-4 rounded-lg border border-slate-200 p-4"
                    >
                      <Link
                        href={`/creations/${item.slug || item.creationId}`}
                        onClick={handleClose}
                        className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100"
                      >
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={item.title}
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
                              href={`/creations/${item.slug || item.creationId}`}
                              onClick={handleClose}
                              className="text-sm font-semibold text-slate-900 hover:text-slate-700"
                            >
                              {item.title}
                            </Link>
                          </div>
                          <button
                            onClick={() => removeItem(item.creationId)}
                            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
                            aria-label="Retirer du panier"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>

                        <div className="flex items-center justify-end">
                          <p className="text-sm font-semibold text-slate-900">
                            {item.price != null ? item.price.toFixed(2) : "—"} €
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Section "Vous pourriez aussi aimer" */}
                {relatedCreations.length > 0 && (
                  <div className="mt-8 border-t border-slate-200 pt-6">
                    <h3 className="text-sm font-semibold text-slate-900 mb-4">
                      Vous pourriez aussi aimer
                    </h3>
                    <div className="space-y-4">
                      {relatedCreations.map((related) => {
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
                          <div
                            key={related._id}
                            className="flex gap-4 rounded-lg border border-slate-200 p-4"
                          >
                            <Link
                              href={`/creations/${related.slug || related._id}`}
                              onClick={handleClose}
                              className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100"
                            >
                              {optimizedImage ? (
                                <img
                                  src={optimizedImage}
                                  alt={related.title}
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
                                    onClick={handleClose}
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
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="border-t border-slate-200 bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-base font-semibold text-slate-900">
                  Sous-total
                </span>
                <span className="text-lg font-bold text-slate-900">
                  {totalPrice.toFixed(2)} €
                </span>
              </div>

              <p className="text-xs text-slate-500 mb-4">
                Choisissez votre mode de livraison dans le panier
              </p>

              <Button
                onClick={handleGoToCart}
                className="w-full cursor-pointer"
                size="lg"
              >
                Finaliser la commande
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
