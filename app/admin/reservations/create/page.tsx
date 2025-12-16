"use client";

import Link from "next/link";
import { FormEvent, useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button, Input, Textarea, Card } from "@/components";
import type { Creation } from "@/components/CreationCard";

type CreationWithStatus = Creation & {
  reserved?: boolean;
  hidden?: boolean;
};

type User = {
  _id: string;
  name?: string;
  email: string;
};

function CreateReservationContent() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [creations, setCreations] = useState<CreationWithStatus[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedCreationIds, setSelectedCreationIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Charger les utilisateurs et les créations
  useEffect(() => {
    async function loadData() {
      try {
        // Charger les utilisateurs
        const usersRes = await fetch("/api/admin/users");
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          setUsers(usersData);
        }

        // Charger toutes les créations (l'admin voit tout, même les vendues)
        const creationsRes = await fetch("/api/creations");
        if (creationsRes.ok) {
          const creationsData = await creationsRes.json();
          // Filtrer uniquement les créations cachées pour l'admin
          const allCreations = creationsData.filter(
            (c: CreationWithStatus) => !c.hidden
          );
          setCreations(allCreations);
        }
      } catch (err) {
        console.error(err);
        setError("Erreur lors du chargement des données");
      }
    }

    if (status === "authenticated" && session?.user?.role === "admin") {
      loadData();
    }
  }, [status, session]);

  // Rediriger si pas admin
  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated" || session?.user?.role !== "admin") {
      router.push("/");
    }
  }, [session, status, router]);

  const handleCreationToggle = (creationId: string) => {
    setSelectedCreationIds((prev) => {
      if (prev.includes(creationId)) {
        return prev.filter((id) => id !== creationId);
      } else {
        return [...prev, creationId];
      }
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedUserId) {
      setError("Veuillez sélectionner un utilisateur");
      return;
    }

    if (selectedCreationIds.length === 0) {
      setError("Veuillez sélectionner au moins une création");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/admin/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          creationIds: selectedCreationIds,
          message: message,
          status: "preparing",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de la création de la commande");
        return;
      }

      setSuccess(`${data.message}. Redirection...`);
      
      // Rediriger vers la page des réservations après 1.5 secondes
      setTimeout(() => {
        router.push("/admin/reservations");
      }, 1500);
    } catch (err) {
      console.error(err);
      setError("Erreur serveur lors de la création de la commande");
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-600">Chargement...</div>
      </main>
    );
  }

  if (!session || session.user.role !== "admin") {
    return null;
  }

  const selectedUser = users.find((u) => u._id === selectedUserId);
  const selectedCreations = creations.filter((c) =>
    selectedCreationIds.includes(c._id)
  );
  const totalPrice = selectedCreations.reduce(
    (sum, c) => sum + (c.price || 0),
    0
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/admin/reservations"
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-2"
          >
            ← Retour aux commandes
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Créer une commande
          </h1>
        </div>

        {/* Messages d'erreur/succès */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 border border-red-200">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800 border border-green-200">
            {success}
          </div>
        )}

        {/* Formulaire */}
        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Sélection de l'utilisateur */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">
                Utilisateur <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                required
              >
                <option value="">-- Sélectionner un utilisateur --</option>
                {users.map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.name || user.email} {user.name && `(${user.email})`}
                  </option>
                ))}
              </select>
            </div>

            {/* Informations de l'utilisateur sélectionné */}
            {selectedUser && (
              <div className="rounded-lg bg-slate-50 p-4 text-sm">
                <p className="font-medium text-slate-900">
                  {selectedUser.name || "Nom non renseigné"}
                </p>
                <p className="text-slate-600">{selectedUser.email}</p>
              </div>
            )}

            {/* Sélection des créations */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">
                Créations <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-slate-500 mb-3">
                Sélectionnez une ou plusieurs créations disponibles
              </p>
              
              {creations.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">
                  Aucune création disponible
                </p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto border border-slate-200 rounded-lg p-4">
                  {creations.map((creation) => {
                    const isSelected = selectedCreationIds.includes(creation._id);
                    const isSold = creation.sold;
                    
                    return (
                      <label
                        key={creation._id}
                        className={`flex items-start gap-3 p-3 rounded-lg border-2 transition ${
                          isSelected
                            ? "border-slate-900 bg-slate-50 cursor-pointer"
                            : "border-slate-200 hover:border-slate-300 cursor-pointer"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleCreationToggle(creation._id)}
                          className="mt-1 w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                        />
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-slate-900">
                                  {creation.title}
                                </p>
                                {isSold && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                                    Vendue
                                  </span>
                                )}
                              </div>
                              <p className="text-xs mt-1 text-slate-600">
                                {creation.type} • {creation.color}
                              </p>
                            </div>
                            <p className="font-semibold ml-4 text-slate-900">
                              {creation.price ? `${creation.price} €` : "Sur demande"}
                            </p>
                          </div>
                          {creation.imageUrl && (
                            <img
                              src={creation.imageUrl}
                              alt={creation.title}
                              className="mt-2 w-20 h-20 object-cover rounded"
                            />
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Récapitulatif */}
            {selectedCreations.length > 0 && (
              <div className="rounded-lg bg-slate-50 p-4 space-y-2">
                <p className="font-medium text-slate-900">Récapitulatif</p>
                <p className="text-sm text-slate-600">
                  {selectedCreations.length} création(s) sélectionnée(s)
                </p>
                <p className="text-lg font-semibold text-slate-900">
                  Total: {totalPrice.toFixed(2)} €
                </p>
              </div>
            )}

            {/* Message optionnel */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">
                Message (optionnel)
              </label>
              <Textarea
                placeholder="Message pour la commande..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
              />
            </div>

            {/* Boutons */}
            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                disabled={loading || selectedCreationIds.length === 0 || !selectedUserId}
                className="cursor-pointer"
              >
                {loading ? "⏳ Création..." : "✅ Créer la commande"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push("/admin/reservations")}
                className="cursor-pointer"
              >
                Annuler
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </main>
  );
}

export default function CreateReservationPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-slate-600">Chargement...</div>
        </main>
      }
    >
      <CreateReservationContent />
    </Suspense>
  );
}
