"use client";

import { useCart } from "@/contexts/CartContext";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui";
import { optimizeCloudinaryUrl } from "@/lib/imageOptimizer";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { useState } from "react";

export default function CartPage() {
  const { items, removeItem, clearCart, getTotalPrice } = useCart();
  const router = useRouter();
  const { data: session } = useSession();
  const [isProcessing, setIsProcessing] = useState(false);

  const totalPrice = getTotalPrice();

  const handleCheckout = async () => {
    if (!session?.user) {
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
      router.push("/account/orders?reserved=true");
    } catch (error) {
      console.error("Erreur lors de la réservation:", error);
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
              <h1 className="mt-6 text-3xl font-bold text-slate-900">
                Votre panier est vide
              </h1>
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
        <div className="mx-auto max-w-4xl px-4 py-8 pb-24 md:pb-8">
          <h1 className="mb-8 text-3xl font-bold text-slate-900">Panier</h1>

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
                        className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
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

          <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <span className="text-lg font-semibold text-slate-900">Total</span>
              <span className="text-2xl font-bold text-slate-900">
                {totalPrice.toFixed(2)} €
              </span>
            </div>

            <div className="mt-6 space-y-3">
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
