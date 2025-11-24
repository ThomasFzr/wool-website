"use client";

import { useState } from "react";
import { Badge, Button, Textarea } from "./ui";

export type Reservation = {
  _id: string;
  name: string;
  contact: string;
  message?: string;
  status: "pending" | "validated" | "cancelled";
  createdAt: string;
  cancelReason?: string;
  cancelledBy?: "admin" | "user";
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

interface ReservationCardProps {
  reservation: Reservation;
  onCancel?: (id: string, reason?: string) => Promise<void>;
  onClick?: () => void;
}

export function ReservationCard({ reservation, onCancel, onClick }: ReservationCardProps) {
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const creation = reservation.creationId;
  const image = creation?.images?.[0] || creation?.imageUrl || undefined;
  const canCancel = reservation.status === "pending" && onCancel;
  const isThisCancelling = cancelId === reservation._id;

  async function handleCancelReservation() {
    if (!onCancel) return;
    
    try {
      setCancelLoading(true);
      setInfo(null);
      await onCancel(reservation._id, cancelReason.trim() || undefined);
      setInfo("Réservation annulée ✔️");
      setCancelId(null);
      setCancelReason("");
    } catch (error) {
      console.error(error);
      setInfo("Erreur lors de l'annulation.");
    } finally {
      setCancelLoading(false);
    }
  }

  const statusVariant = 
    reservation.status === "pending" ? "warning" :
    reservation.status === "validated" ? "success" : "danger";

  const statusLabel =
    reservation.status === "pending" ? "En attente" :
    reservation.status === "validated" ? "Validée" : "Annulée";

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${
        onClick ? "cursor-pointer hover:bg-slate-50" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex gap-3">
        {image && (
          <img
            src={image}
            alt={creation?.title ?? "Article réservé"}
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
                Réservé le {new Date(reservation.createdAt).toLocaleString("fr-FR")}
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

          {reservation.message && (
            <p className="mt-1 text-xs text-slate-500">
              Votre message : {reservation.message}
            </p>
          )}

          {reservation.status === "cancelled" && reservation.cancelledBy === "user" && (
            <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 border border-slate-200">
              <p className="text-xs font-semibold text-slate-700">
                Vous avez annulé cette réservation
              </p>
              {reservation.cancelReason && (
                <p className="mt-1 text-xs text-slate-600">
                  Raison : {reservation.cancelReason}
                </p>
              )}
            </div>
          )}
          {reservation.status === "cancelled" && reservation.cancelledBy !== "user" && (
            <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 border border-red-200">
              <p className="text-xs font-semibold text-red-800">
                ⚠️ Annulée par la créatrice
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

      {canCancel && (
        <div className="mt-3 border-t border-slate-200 pt-3" onClick={(e) => e.stopPropagation()}>
          {!isThisCancelling ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setCancelId(reservation._id);
                setCancelReason("");
                setInfo(null);
              }}
            >
              Annuler ma réservation
            </Button>
          ) : (
            <div className="space-y-2">
              <Textarea
                placeholder="Pourquoi souhaitez-vous annuler ? (facultatif)"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={2}
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleCancelReservation}
                  disabled={cancelLoading}
                >
                  {cancelLoading ? "Annulation..." : "Confirmer l'annulation"}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setCancelId(null);
                    setCancelReason("");
                    setInfo(null);
                  }}
                  className="text-[11px] text-slate-500 hover:underline"
                >
                  Garder ma réservation
                </button>
              </div>
              {info && <p className="text-[11px] text-slate-600">{info}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
