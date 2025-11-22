import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { redirect } from "next/navigation";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";

function formatStatus(status: string) {
  switch (status) {
    case "pending":
      return "En attente";
    case "validated":
      return "Validée";
    case "cancelled":
      return "Annulée";
    default:
      return status;
  }
}

export default async function OrdersPage() {
  const session = await getServerSession(authOptions);

  // 🔐 Protection
  if (!session || !session.user || !session.user.email) {
    redirect("/api/auth/signin?callbackUrl=/orders");
  }

  await connectToDatabase();

  // 🔎 On récupère les réservations associées à l’email du compte
  const docs = await Reservation.find({ contact: session.user.email })
    .sort({ createdAt: -1 })
    .populate("creationId", "title price images color description")
    .lean();

  const reservations = docs.map((r: any) => ({
    _id: r._id.toString(),
    status: r.status as string,
    message: r.message as string | undefined,
    createdAt: r.createdAt as Date,
    creation: r.creationId
      ? {
          _id: r.creationId._id.toString(),
          title: r.creationId.title as string,
          price: r.creationId.price as number | undefined,
          color: r.creationId.color as string | undefined,
          description: r.creationId.description as string | undefined,
          image:
            (r.creationId.images && r.creationId.images[0]) ||
            null,
        }
      : null,
  }));

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between">
          <a
            href="/"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Retour à la boutique
          </a>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight mb-6">
          Mes réservations
        </h1>

        {reservations.length === 0 && (
          <p className="text-sm text-slate-600">
            Vous n’avez pas encore de réservation avec cet email.
          </p>
        )}

        <div className="space-y-4">
          {reservations.map((r) => (
            <article
              key={r._id}
              className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 flex gap-4"
            >
              {/* Image de l’article */}
              {r.creation?.image ? (
                <img
                  src={r.creation.image}
                  alt={r.creation.title}
                  className="h-20 w-20 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="h-20 w-20 rounded-lg bg-slate-100 flex items-center justify-center text-xs text-slate-400 shrink-0">
                  Pas d&apos;image
                </div>
              )}

              <div className="flex-1 space-y-1">
                {/* Titre + prix + statut */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {r.creation?.title ?? "Article supprimé"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Réservé le{" "}
                      {r.createdAt.toLocaleString("fr-FR")}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {r.creation?.price != null && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800">
                        {r.creation.price} €
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        r.status === "pending"
                          ? "bg-yellow-100 text-yellow-800"
                          : r.status === "validated"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {formatStatus(r.status)}
                    </span>
                  </div>
                </div>

                {r.creation?.color && (
                  <p className="text-xs text-slate-600">
                    Couleur : {r.creation.color}
                  </p>
                )}

                {r.message && (
                  <p className="text-xs text-slate-600 whitespace-pre-line">
                    Votre message : {r.message}
                  </p>
                )}

                {r.creation?.description && (
                  <p className="text-xs text-slate-500 line-clamp-2 whitespace-pre-line">
                    {r.creation.description}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}