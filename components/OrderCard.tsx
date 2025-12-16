"use client";

import Image from "next/image";
import { Badge } from "./ui";
import { Reservation } from "./ReservationCard";

export type Order = {
  id: string;
  items: Reservation[];
  createdAt: string;
  status: "pending" | "preparing" | "shipped" | "in_transit" | "delivered" | "validated" | "cancelled";
  deliveryMode?: "pickup" | "shipping";
  totalPrice: number;
  shippingCost: number;
  subtotal: number;
  trackingNumber?: string;
};

interface OrderCardProps {
  order: Order;
  onItemClick?: (creationId: string) => void;
}

export function OrderCard({ order, onItemClick }: OrderCardProps) {
  const getStatusInfo = (status: string) => {
    switch (status) {
      case "pending":
      case "preparing":
        return { variant: "warning" as const, label: "En préparation" };
      case "shipped":
        return { variant: "success" as const, label: "Expédiée" };
      case "in_transit":
        return { variant: "success" as const, label: "En cours de livraison" };
      case "delivered":
        return { variant: "success" as const, label: "Livrée" };
      case "validated":
        return { variant: "warning" as const, label: "En préparation" };
      case "cancelled":
        return { variant: "danger" as const, label: "Annulée" };
      default:
        return { variant: "success" as const, label: "En cours" };
    }
  };

  const statusInfo = getStatusInfo(order.status);
  const statusVariant = statusInfo.variant;
  const statusLabel = statusInfo.label;

  const deliveryLabel = 
    order.deliveryMode === "shipping" ? "Livraison" : "Remise en main propre";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* En-tête de la commande */}
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Commande du {new Date(order.createdAt).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            })}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {order.items.length} article{order.items.length > 1 ? "s" : ""} • {order.totalPrice} €
          </p>
        </div>
        <Badge variant={statusVariant}>
          {statusLabel}
        </Badge>
      </div>

      {/* Liste des articles */}
      <div className="divide-y divide-slate-100">
        {order.items.map((item) => {
          const creation = item.creationId;
          const image = creation?.images?.[0] || creation?.imageUrl || undefined;

          return (
            <div 
              key={item._id} 
              className={`p-4 flex gap-3 ${onItemClick && creation?._id ? "cursor-pointer hover:bg-slate-50 transition-colors" : ""}`}
              onClick={() => {
                if (onItemClick && creation?._id) {
                  onItemClick(creation._id);
                }
              }}
            >
              {image && (
                <Image
                  src={image}
                  alt={creation?.title ?? "Article"}
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-md object-cover shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {creation?.title ?? "Article supprimé"}
                </p>
                {creation?.color && (
                  <p className="text-xs text-slate-500">
                    Couleur : {creation.color}
                  </p>
                )}
                {creation?.price != null && (
                  <p className="text-xs text-slate-700 font-medium mt-1">
                    {creation.price} €
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pied de la commande */}
      <div className="bg-slate-50 px-4 py-3 border-t border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-slate-600">
            📦 {deliveryLabel}
          </p>
        </div>
        {order.trackingNumber && (
          <div className="mb-2">
            <p className="text-xs text-slate-600">
              🔢 Numéro de suivi : <span className="font-semibold">{order.trackingNumber}</span>
            </p>
          </div>
        )}
        <div className="flex justify-between text-xs text-slate-600">
          <span>Sous-total articles</span>
          <span>{order.subtotal} €</span>
        </div>
        {order.shippingCost > 0 && (
          <div className="flex justify-between text-xs text-slate-600">
            <span>Frais de livraison</span>
            <span>{order.shippingCost} €</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-semibold text-slate-900 mt-2 pt-2 border-t border-slate-200">
          <span>Total</span>
          <span>{order.totalPrice} €</span>
        </div>
      </div>
    </div>
  );
}
