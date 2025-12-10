"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui";
import Link from "next/link";
import { optimizeCloudinaryUrl } from "@/lib/imageOptimizer";
import Image from "next/image";

interface SessionDetails {
  id: string;
  amountTotal: number;
  currency: string;
  paymentStatus: string;
  customerEmail: string;
  lineItems: Array<{
    description: string | null;
    amount: number;
    quantity: number;
    image: string | null;
  }>;
}

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [sessionDetails, setSessionDetails] = useState<SessionDetails | null>(
    null
  );

  useEffect(() => {
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      setIsLoading(false);
      return;
    }

    // Vérifier que la session est valide
    fetch(`/api/stripe/verify-session?session_id=${sessionId}`)
      .then((res) => res.json())
      .then((data) => {
        setIsValid(data.valid || false);
        if (data.valid && data.session) {
          setSessionDetails(data.session);
        }
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Erreur lors de la vérification:", error);
        setIsLoading(false);
      });
  }, [searchParams]);

  const formatPrice = (amount: number, currency: string) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  if (isLoading) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-linear-to-br from-slate-50 via-pink-50/30 to-slate-50">
          <div className="mx-auto max-w-2xl px-4 py-16">
            <div className="text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900"></div>
              <p className="mt-4 text-slate-600">Vérification en cours...</p>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (!isValid) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-linear-to-br from-slate-50 via-pink-50/30 to-slate-50">
          <div className="mx-auto max-w-2xl px-4 py-16">
            <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <svg
                  className="h-8 w-8 text-red-600"
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
              </div>
              <h1 className="mt-6 text-2xl font-bold text-slate-900">
                Session invalide
              </h1>
              <p className="mt-2 text-slate-600">
                La session de paiement n'a pas pu être vérifiée.
              </p>
              <div className="mt-6">
                <Link href="/account/orders">
                  <Button className="cursor-pointer">Voir mes commandes</Button>
                </Link>
              </div>
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
        <div className="mx-auto max-w-2xl px-4 py-16">
          <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100">
            {/* Icône de succès */}
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-8 w-8 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h1 className="mt-6 text-2xl font-bold text-slate-900">
                Paiement confirmé !
              </h1>
              <p className="mt-2 text-slate-600">
                Merci pour votre achat. Votre commande a été enregistrée et vous
                recevrez un email de confirmation sous peu.
              </p>
            </div>

            {/* Résumé de la commande */}
            {sessionDetails && (
              <div className="mt-8 border-t border-slate-200 pt-8">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">
                  Résumé de votre commande
                </h2>
                <div className="space-y-3">
                  {sessionDetails.lineItems.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-4 py-3 border-b border-slate-100 last:border-0"
                    >
                      {/* Image de l'article */}
                      {item.image && (
                        <div className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-slate-100">
                          <Image
                            src={optimizeCloudinaryUrl(item.image, {
                              width: 160,
                              quality: 80,
                              format: "auto",
                            })}
                            alt={item.description || "Article"}
                            fill
                            className="object-cover"
                            sizes="80px"
                          />
                        </div>
                      )}
                      {/* Détails de l'article */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          {item.description || "Article"}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Quantité: {item.quantity}
                        </p>
                      </div>
                      {/* Prix */}
                      <p className="text-sm font-semibold text-slate-900 shrink-0">
                        {formatPrice(item.amount, sessionDetails.currency)}
                      </p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-4 border-t-2 border-slate-200">
                    <p className="text-base font-bold text-slate-900">Total</p>
                    <p className="text-lg font-bold text-slate-900">
                      {formatPrice(
                        sessionDetails.amountTotal,
                        sessionDetails.currency
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-6 p-4 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-600">
                    <span className="font-medium">Email de confirmation:</span>{" "}
                    {sessionDetails.customerEmail}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Numéro de commande: {sessionDetails.id}
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-8 space-y-3">
              <Link href="/account/orders">
                <Button className="w-full cursor-pointer" size="lg">
                  Voir mes commandes
                </Button>
              </Link>
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
