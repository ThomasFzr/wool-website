"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Reservation } from "@/components/ReservationCard";
import { OrderCard, Order } from "@/components/OrderCard";

export default function OrdersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Regrouper les réservations par commande (stripeCheckoutSessionId)
  const orders = useMemo(() => {
    const grouped = new Map<string, Reservation[]>();
    
    reservations.forEach((res) => {
      // Utiliser stripeCheckoutSessionId comme clé, ou l'ID de la réservation si pas de session
      const key = res.stripeCheckoutSessionId || res._id;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(res);
    });

    // Convertir en tableau de commandes
    const orderList: Order[] = [];
    grouped.forEach((items, id) => {
      const firstItem = items[0];
      const subtotal = items.reduce((sum, item) => sum + (item.creationId?.price || 0), 0);
      const shippingCost = items.reduce((sum, item) => sum + (item.shippingCost || 0), 0);
      const totalPrice = subtotal + shippingCost;
      
      // Déterminer le statut global de la commande (prendre le statut le plus avancé)
      const statusPriority: Record<string, number> = {
        cancelled: 0,
        pending: 1,
        preparing: 2,
        shipped: 3,
        in_transit: 4,
        delivered: 5,
        validated: 6,
      };
      
      const allCancelled = items.every(i => i.status === "cancelled");
      if (allCancelled) {
        orderList.push({
          id,
          items,
          createdAt: firstItem.paidAt || firstItem.createdAt,
          status: "cancelled",
          deliveryMode: firstItem.deliveryMode,
          subtotal,
          shippingCost,
          totalPrice,
          trackingNumber: items.find(i => i.trackingNumber)?.trackingNumber,
        });
      } else {
        // Prendre le statut le plus avancé
        const sortedByStatus = [...items].sort((a, b) => 
          (statusPriority[b.status] || 0) - (statusPriority[a.status] || 0)
        );
        const highestStatus = sortedByStatus[0].status as any;

        orderList.push({
          id,
          items,
          createdAt: firstItem.paidAt || firstItem.createdAt,
          status: highestStatus,
          deliveryMode: firstItem.deliveryMode,
          subtotal,
          shippingCost,
          totalPrice,
          trackingNumber: items.find(i => i.trackingNumber)?.trackingNumber,
        });
      }
    });

    // Trier par date décroissante
    return orderList.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [reservations]);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/account/reservations");
      if (!res.ok) {
        throw new Error("Erreur chargement");
      }
      const data = await res.json();
      setReservations(data.reservations ?? []);
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

  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = `/login?callbackUrl=${encodeURIComponent("/account/orders")}`;
    }
  }, [status]);

  function handleItemClick(creationId: string) {
    // Rediriger vers la page de la création
    router.push(`/creations/${creationId}`);
  }

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
          <OrderCard
            key={order.id}
            order={order}
            onItemClick={handleItemClick}
          />
        ))}
      </div>
    </main>
  );
}
