"use client";

import { useCart } from "@/contexts/CartContext";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui";
import { RelatedCreationCard } from "@/components/RelatedCreationCard";
import { CartUnavailableNotice } from "@/components/CartUnavailableNotice";
import { useRelatedCreations } from "@/hooks/useRelatedCreations";
import { optimizeCloudinaryUrl } from "@/lib/imageOptimizer";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function CartPage() {
  const {
    items,
    removeItem,
    getTotalPrice,
    getTotalWithShipping,
    deliveryMode,
    setDeliveryMode,
    shippingCost,
    isPickupAvailable,
    pickupUnavailableReason,
    pickupConditions,
    reloadPostalCode,
    refreshAvailability,
  } = useCart();
  const { data: session } = useSession();
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);

  // Récupérer les articles liés des articles dans le panier (un seul appel API)
  const relatedCreations = useRelatedCreations(items);

  // Recharger le code postal quand on arrive sur la page panier
  useEffect(() => {
    if (session?.user) {
      reloadPostalCode();
    }
  }, [session, reloadPostalCode]);

  const subtotal = getTotalPrice();
  const totalPrice = getTotalWithShipping();

  const handleCheckout = async () => {
    if (!session?.user) {
      router.push("/login?callbackUrl=/cart");
      return;
    }

    if (items.length === 0) {
      return;
    }

    setIsProcessing(true);

    try {
      // Créer une session de checkout Stripe
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, deliveryMode }),
      });

      if (!response.ok) {
        // Texte brut, ou JSON `{ error }` pour une entrée refusée par la validation (400)
        const rawError = await response.text();
        let errorText = rawError;
        try {
          errorText = JSON.parse(rawError).error ?? rawError;
        } catch {
          // pas du JSON : message texte
        }
        let errorMessage = "Erreur lors de la création de la session de paiement";
        
        // Messages d'erreur plus clairs
        if (errorText.includes("STRIPE_SECRET_KEY")) {
          errorMessage = "Stripe n'est pas configuré. Veuillez contacter l'administrateur.";
        } else if (errorText.includes("Panier vide")) {
          errorMessage = "Votre panier est vide.";
        } else if (errorText.includes("déjà réservées")) {
          errorMessage = "Certains articles ont déjà été réservés. Veuillez actualiser la page.";
        } else if (errorText) {
          errorMessage = errorText;
        }
        
        alert(errorMessage);
        // L'article refusé est peut-être vendu : on resynchronise le panier
        refreshAvailability();
        setIsProcessing(false);
        return;
      }

      const data = await response.json();

      if (data.url) {
        // Rediriger vers Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error("URL de checkout non reçue");
      }
    } catch (error) {
      console.error("Erreur lors du checkout:", error);
      alert("Une erreur est survenue. Veuillez réessayer.");
      setIsProcessing(false);
    }
  };

  if (items.length === 0) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-linear-to-br from-slate-50 via-pink-50/30 to-slate-50">
          <div className="mx-auto max-w-4xl px-4 py-16">
            <div className="text-center">
              <svg
                className="mx-auto h-24 w-24 text-slate-300"
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
              <h2 className="mt-6 text-3xl font-bold text-slate-900">
                Votre panier est vide
              </h2>
              <p className="mt-2 text-slate-600">
                Ajoutez des articles à votre panier pour commencer.
              </p>
              <Link href="/">
                <Button className="mt-6 cursor-pointer" size="lg">
                  Découvrir les créations
                </Button>
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-linear-to-br from-slate-50 via-pink-50/30 to-slate-50">
        <div className="mx-auto max-w-4xl px-4 py-8 pb-8 md:pb-8">
          <h1 className="mb-8 text-3xl font-bold text-slate-900">Panier</h1>

          <CartUnavailableNotice className="mb-6" />

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
                  className="flex gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100"
                >
                  <Link
                    href={`/creations/${item.slug || item.creationId}`}
                    className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100"
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={item.title}
                        title={item.title}
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
                          className="text-base font-semibold text-slate-900 hover:text-slate-700"
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
                          className="h-5 w-5"
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
                      <div className="text-right">
                        <p className="text-base font-semibold text-slate-900">
                          {item.price != null ? item.price.toFixed(2) : "—"} €
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Section "Vous pourriez aussi aimer" */}
          {relatedCreations.length > 0 && (
            <div className="mt-6 md:mt-8 rounded-2xl bg-white p-4 md:p-6 shadow-sm ring-1 ring-slate-100">
              <h3 className="text-base md:text-lg font-semibold text-slate-900 mb-3 md:mb-4">
                Vous pourriez aussi aimer
              </h3>
              <div className="space-y-4">
                {relatedCreations.map((related) => (
                  <RelatedCreationCard key={related._id} related={related} />
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 rounded-2xl bg-white p-4 md:p-6 shadow-sm ring-1 ring-slate-100">
            {/* Choix du mode de livraison */}
            <div className="mb-4 md:mb-6">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">
                Mode de récupération
              </h3>
              <div className="space-y-2">
                <label
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                    !isPickupAvailable
                      ? "border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed"
                      : deliveryMode === "pickup"
                      ? "border-slate-900 bg-slate-50 cursor-pointer"
                      : "border-slate-200 hover:border-slate-300 cursor-pointer"
                  }`}
                >
                  <input
                    type="radio"
                    name="deliveryMode"
                    value="pickup"
                    checked={deliveryMode === "pickup"}
                    onChange={() => isPickupAvailable && setDeliveryMode("pickup")}
                    disabled={!isPickupAvailable}
                    className="sr-only"
                  />
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      deliveryMode === "pickup" && isPickupAvailable
                        ? "border-slate-900"
                        : "border-slate-300"
                    }`}
                  >
                    {deliveryMode === "pickup" && isPickupAvailable && (
                      <div className="w-2.5 h-2.5 rounded-full bg-slate-900" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">
                      Remise en main propre
                    </p>
                    {!isPickupAvailable && pickupUnavailableReason ? (
                      <div className="text-xs text-red-600">
                        {pickupUnavailableReason}
                        {pickupUnavailableReason.includes("code postal") && session?.user && (
                          <span className="block mt-1">
                            <Link href="/account" className="underline hover:text-red-700">
                              Mettre à jour mon profil
                            </Link>
                          </span>
                        )}
                      </div>
                    ) : pickupConditions?.message ? (
                      <p className="text-xs text-slate-500">{pickupConditions.message}</p>
                    ) : (
                      <p className="text-xs text-slate-500">Gratuit</p>
                    )}
                  </div>
                  <span className={`text-sm font-semibold ${
                    isPickupAvailable ? "text-green-600" : "text-slate-400"
                  }`}>
                    Gratuit
                  </span>
                </label>

                <label
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    deliveryMode === "shipping"
                      ? "border-slate-900 bg-slate-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="deliveryMode"
                    value="shipping"
                    checked={deliveryMode === "shipping"}
                    onChange={() => setDeliveryMode("shipping")}
                    className="sr-only"
                  />
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      deliveryMode === "shipping"
                        ? "border-slate-900"
                        : "border-slate-300"
                    }`}
                  >
                    {deliveryMode === "shipping" && (
                      <div className="w-2.5 h-2.5 rounded-full bg-slate-900" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">Livraison</p>
                    <p className="text-xs text-slate-500">
                      Envoi postal à votre adresse
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">
                    +{shippingCost.toFixed(2)} €
                  </span>
                </label>
              </div>
            </div>

            {/* Récapitulatif des prix */}
            <div className="border-t border-slate-200 pt-3 md:pt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Sous-total</span>
                <span className="text-slate-900">{subtotal.toFixed(2)} €</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">
                  {deliveryMode === "pickup" ? "Remise en main propre" : "Livraison"}
                </span>
                <span className="text-slate-900">
                  {deliveryMode === "pickup" ? "Gratuit" : `${shippingCost.toFixed(2)} €`}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="text-lg font-semibold text-slate-900">Total</span>
                <span className="text-2xl font-bold text-slate-900">
                  {totalPrice.toFixed(2)} €
                </span>
              </div>
            </div>

            <div className="mt-4 md:mt-6 space-y-3">
              <Button
                onClick={handleCheckout}
                disabled={isProcessing}
                className="w-full cursor-pointer"
                size="lg"
              >
                {isProcessing
                  ? "Traitement..."
                  : session
                  ? "Procéder au paiement"
                  : "Se connecter pour payer"}
              </Button>

              <Link href="/">
                <Button
                  variant="secondary"
                  className="w-full cursor-pointer"
                  size="lg"
                >
                  Continuer les achats
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
