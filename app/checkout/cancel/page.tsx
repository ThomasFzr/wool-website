"use client";

import { Header } from "@/components/Header";
import { Button } from "@/components/ui";
import Link from "next/link";

export default function CheckoutCancelPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-linear-to-br from-slate-50 via-pink-50/30 to-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-16">
          <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100">
              <svg
                className="h-8 w-8 text-yellow-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h1 className="mt-6 text-2xl font-bold text-slate-900">
              Paiement annulé
            </h1>
            <p className="mt-2 text-slate-600">
              Votre paiement a été annulé. Aucun montant n'a été débité.
            </p>
            <p className="mt-4 text-sm text-slate-500">
              Si vous souhaitez finaliser votre commande, vous pouvez retourner
              à votre panier.
            </p>
            <div className="mt-8 space-y-3">
              <Link href="/cart">
                <Button className="w-full cursor-pointer" size="lg">
                  Retour au panier
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
