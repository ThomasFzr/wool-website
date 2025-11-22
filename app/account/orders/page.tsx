"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

type Reservation = {
  _id: string;
  creationId?: {
    _id: string;
    title: string;
    images?: string[];
    imageUrl?: string;
    price?: number;
    color?: string;
    description?: string;
  } | null;
  status: "pending" | "validated" | "cancelled";
  message?: string;
  cancelReason?: string;
  createdAt: string;
};

export default function OrdersPage() {
  const { data: session, status } = useSession();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

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
      setError("Impossible de charger vos réservations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === "authenticated") {
      load();
    }
  }, [status]);

  async function handleCancelReservation(id: string) {
    if (!cancelReason.trim()) {
      setInfo("Merci d'indiquer une raison d'annulation.");
      return;
    }

    try {
      setCancelLoading(true);
      setInfo(null);

      const res = await fetch(`/api/account/reservations/${id}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });

      if (!res.ok) {
        const text = await res.text();
        setInfo(text || "Erreur lors de l'annulation.");
        return;
      }

      setInfo("Réservation annulée ✔️");
      setCancelId(null);
      setCancelReason("");
      await load();
    } catch (e) {
      console.error(e);
      setInfo("Erreur réseau, réessayez plus tard.");
    } finally {
      setCancelLoading(false);
    }
  }

  if (status === "loading") {
    return <p className="p-8 text-sm text-slate-500">Chargement...</p>;
  }

  if (!session) {
    return (
      <main className="p-8 max-w-3xl mx-auto">
        <p className="text-sm text-slate-600">
          Vous devez être connecté pour voir vos commandes.
        </p>
      </main>
    );
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
        <h1 className="text-xl font-semibold">Mes réservations</h1>
      </div>

      {loading && (
        <p className="text-sm text-slate-500">Chargement de vos réservations…</p>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {!loading && !error && reservations.length === 0 && (
        <p className="text-sm text-slate-500">
          Vous n&apos;avez pas encore de réservation.
        </p>
      )}

      <div className="mt-4 space-y-4">
        {reservations.map((r) => {
          const creation = r.creationId;
          const image =
            creation?.images?.[0] || creation?.imageUrl || undefined;

          const canCancel = r.status === "pending";

          const isThisCancelling = cancelId === r._id;

          return (
            <div
              key={r._id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
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
                        Réservé le{" "}
                        {new Date(r.createdAt).toLocaleString("fr-FR")}
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                        r.status === "pending"
                          ? "bg-yellow-100 text-yellow-700"
                          : r.status === "validated"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {r.status === "pending"
                        ? "En attente"
                        : r.status === "validated"
                        ? "Validée"
                        : "Annulée"}
                    </span>
                  </div>

                  {creation?.price != null && (
                    <p className="text-xs text-slate-700">
                      Prix :{" "}
                      <span className="font-semibold">
                        {creation.price} €
                      </span>
                    </p>
                  )}
                  {creation?.color && (
                    <p className="text-xs text-slate-700">
                      Couleur : {creation.color}
                    </p>
                  )}

                  {r.message && (
                    <p className="mt-1 text-xs text-slate-500">
                      Votre message : {r.message}
                    </p>
                  )}

                  {r.cancelReason && (
                    <p className="mt-1 text-xs text-slate-500">
                      Raison d&apos;annulation : {r.cancelReason}
                    </p>
                  )}
                </div>
              </div>

              {/* Bloc d'annulation pour les réservations non validées */}
              {canCancel && (
                <div className="mt-3 border-t border-slate-200 pt-3">
                  {!isThisCancelling ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCancelId(r._id);
                        setCancelReason("");
                        setInfo(null);
                      }}
                      className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Annuler ma réservation
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <textarea
                        placeholder="Pourquoi souhaitez-vous annuler ?"
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCancelReservation(r._id)}
                          disabled={cancelLoading}
                          className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          {cancelLoading
                            ? "Annulation..."
                            : "Confirmer l'annulation"}
                        </button>
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
                      {info && (
                        <p className="text-[11px] text-slate-600">{info}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}