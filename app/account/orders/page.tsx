"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ReservationCard, Reservation } from "@/components/ReservationCard";

export default function OrdersPage() {
  const { data: session, status } = useSession();
  const [orders, setOrders] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/account/reservations");
      if (!res.ok) {
        throw new Error("Erreur chargement");
      }
      const data = await res.json();
      setOrders(data.reservations ?? []);
    } catch (e) {
      console.error(e);
      setError("Impossible de charger vos commandes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === "authenticated") {
      load();
    }
  }, [status]);

  async function handleCancelOrder(id: string, reason?: string) {
    const res = await fetch(`/api/account/reservations/${id}/cancel`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Erreur lors de l'annulation.");
    }

    await load();
  }

  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = `/login?callbackUrl=${encodeURIComponent("/account/orders")}`;
    }
  }, [status]);

  if (status === "loading") {
    return <p className="p-8 text-sm text-slate-500">Chargement...</p>;
  }

  if (!session) {
    return null;
  }

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Retour à l&apos;accueil
        </Link>
        <h1 className="text-xl font-semibold">Mes commandes</h1>
      </div>

      {loading && (
        <p className="text-sm text-slate-500">Chargement de vos commandes…</p>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {!loading && !error && orders.length === 0 && (
        <p className="text-sm text-slate-500">
          Vous n&apos;avez pas encore de commande.
        </p>
      )}

      <div className="mt-4 space-y-4">
        {orders.map((order) => (
          <ReservationCard
            key={order._id}
            reservation={order}
            onCancel={handleCancelOrder}
          />
        ))}
      </div>
    </main>
  );
}
