"use client";

import Image from "next/image";
import { Badge } from "./ui";

export type Reservation = {
  _id: string;
  name: string;
  contact: string;
  message?: string;
  status: "pending" | "preparing" | "shipped" | "in_transit" | "delivered" | "validated" | "cancelled";
  createdAt: string;
  cancelReason?: string;
  cancelledBy?: "admin" | "user";
  deliveryMode?: "pickup" | "shipping";
  shippingCost?: number;
  trackingNumber?: string;
  shippedAt?: string;
  stripeCheckoutSessionId?: string;
  paidAt?: string;
  shippingAddress?: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    postalCode: string;
    country: string;
  };
  creationId?: {
    _id: string;
    title: string;
    images?: string[];
    imageUrl?: string;
    price?: number;
    color?: string;
    description?: string;
  } | null;
};

// Alias pour la rétrocompatibilité
export type Order = Reservation;

interface ReservationCardProps {
  reservation: Reservation;
  onClick?: () => void;
}

// Renommé en OrderCard mais avec alias pour rétrocompatibilité
export function ReservationCard({ reservation, onClick }: ReservationCardProps) {
  const creation = reservation.creationId;
  const image = creation?.images?.[0] || creation?.imageUrl || undefined;

  const getStatusInfo = (status: string) => {
    switch (status) {
      case "pending":
        return { variant: "success" as const, label: "En cours de préparation" };
      case "preparing":
        return { variant: "warning" as const, label: "En préparation" };
      case "shipped":
        return { variant: "success" as const, label: "Expédiée" };
      case "in_transit":
        return { variant: "success" as const, label: "En cours de livraison" };
      case "delivered":
        return { variant: "success" as const, label: "Livrée" };
      case "validated":
        return { variant: "success" as const, label: "Confirmée" };
      case "cancelled":
        return { variant: "danger" as const, label: "Annulée" };
      default:
        return { variant: "success" as const, label: "En cours" };
    }
  };

  const statusInfo = getStatusInfo(reservation.status);
  const statusVariant = statusInfo.variant;
  const statusLabel = statusInfo.label;

  const deliveryLabel = 
    reservation.deliveryMode === "shipping" ? "Livraison" : "Remise en main propre";

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${
        onClick ? "cursor-pointer hover:bg-slate-50" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex gap-3">
        {image && (
          <Image
            src={image}
            alt={creation?.title ?? "Article réservé"}
            title={creation?.title ?? "Article réservé"}
            width={80}
            height={80}
            className="h-20 w-20 rounded-md object-cover shrink-0"
          />
        )}

        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">
                {creation?.title ?? "Article supprimé"}
              </p>
              <p className="text-xs text-slate-500">
                Commandé le {new Date(reservation.createdAt).toLocaleString("fr-FR")}
              </p>
            </div>

            <Badge variant={statusVariant}>
              {statusLabel}
            </Badge>
          </div>

          {creation?.price != null && (
            <p className="text-xs text-slate-700">
              Prix : <span className="font-semibold">{creation.price} €</span>
            </p>
          )}
          {creation?.color && (
            <p className="text-xs text-slate-700">
              Couleur : {creation.color}
            </p>
          )}
          {reservation.deliveryMode && (
            <p className="text-xs text-slate-700">
              📦 {deliveryLabel}
            </p>
          )}

          {reservation.message && (
            <p className="mt-1 text-xs text-slate-500">
              Votre message : {reservation.message}
            </p>
          )}

          {reservation.status === "cancelled" && (
            <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 border border-red-200">
              <p className="text-xs font-semibold text-red-800">
                ⚠️ Commande annulée
              </p>
              {reservation.cancelReason && (
                <p className="mt-1 text-xs text-red-700">
                  Raison : {reservation.cancelReason}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
