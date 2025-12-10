"use client";

import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui";
import { optimizeCloudinaryUrl } from "@/lib/imageOptimizer";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { useState, useEffect } from "react";

export function CartModal() {
  const {
    items,
    isOpen,
    closeCart,
    removeItem,
    clearCart,
    getTotalPrice,
  } = useCart();
  const router = useRouter();
  const { data: session } = useSession();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const totalPrice = getTotalPrice();

  // Détecter si on est sur mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

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
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        closeCart();
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, closeCart]);

  const handleCheckout = async () => {
    if (!session?.user) {
      closeCart();
      signIn(undefined, { callbackUrl: "/cart" });
      return;
    }

    if (items.length === 0) {
      return;
    }

    setIsProcessing(true);

    try {
      // Créer une réservation pour chaque article du panier
      const reservations = await Promise.all(
        items.map((item) =>
          fetch(`/api/creations/${item.creationId}/reserve`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: session.user?.name || "",
              contact: session.user?.email || "",
            }),
          })
        )
      );

      // Vérifier si toutes les réservations ont réussi
      const failed = reservations.some((res) => !res.ok);
      if (failed) {
        alert(
          "Certains articles n'ont pas pu être réservés. Veuillez réessayer."
        );
        setIsProcessing(false);
        return;
      }

      // Vider le panier et rediriger vers la page de confirmation
      clearCart();
      closeCart();
      router.push("/account/orders?reserved=true");
    } catch (error) {
      console.error("Erreur lors de la réservation:", error);
      alert("Une erreur est survenue. Veuillez réessayer.");
      setIsProcessing(false);
    }
  };

  // Ne pas afficher la modale sur mobile
  if (!isOpen || isMobile) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/50 transition-opacity"
        onClick={closeCart}
      />

      {/* Modale */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto bg-white shadow-xl transition-transform">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Panier</h2>
            <button
              onClick={closeCart}
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
                        onClick={closeCart}
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
                              onClick={closeCart}
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
              </div>
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="border-t border-slate-200 bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-base font-semibold text-slate-900">
                  Total
                </span>
                <span className="text-lg font-bold text-slate-900">
                  {totalPrice.toFixed(2)} €
                </span>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={handleCheckout}
                  disabled={isProcessing}
                  className="w-full cursor-pointer"
                  size="lg"
                >
                  {isProcessing
                    ? "Traitement..."
                    : session
                    ? "Réserver les articles"
                    : "Se connecter pour réserver"}
                </Button>

                <Link href="/cart" onClick={closeCart}>
                  <Button
                    variant="secondary"
                    className="w-full cursor-pointer"
                    size="lg"
                  >
                    Voir le panier complet
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
