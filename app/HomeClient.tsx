"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { CreationCard, Creation } from "@/components/CreationCard";
import { CreationModal } from "@/components/CreationModal";
import { Filters } from "@/components/Filters";

type HomeClientProps = {
  initialCreations: Creation[];
};

export function HomeClient({ initialCreations }: HomeClientProps) {
  const { data: session } = useSession();
  const [creations, setCreations] = useState<Creation[]>(initialCreations);
  const [openCreation, setOpenCreation] = useState<Creation | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(false);

  function openModal(creation: Creation) {
    setOpenCreation(creation);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setTimeout(() => setOpenCreation(null), 150);
  }

  async function handleReserve(creation: Creation) {
    if (!session?.user) return;

    const name = session.user.name || "";
    const contact = session.user.email || "";

    if (!name || !contact) {
      alert("Impossible de récupérer vos informations. Veuillez vous reconnecter.");
      return;
    }

    const res = await fetch(`/api/creations/${creation._id}/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, contact }),
    });

    if (res.status === 409) {
      alert("Cet article vient déjà d'être réservé.");
      return;
    }
    if (!res.ok) {
      alert("Erreur lors de la réservation, réessayez plus tard.");
      return;
    }

    // Mise à jour locale
    setCreations((prev) =>
      prev.map((c) =>
        c._id === creation._id ? { ...c, reserved: true } : c
      )
    );
  }

  // Calcul des couleurs disponibles
  const rawColors = Array.from(
    new Set(
      creations
        .map((c) => c.color?.trim())
        .filter((c): c is string => Boolean(c))
    )
  );

  const availableColors = rawColors.sort((a, b) => {
    if (a.toLowerCase() === "multicolore") return 1;
    if (b.toLowerCase() === "multicolore") return -1;
    return a.localeCompare(b);
  });

  // Filtrage des créations
  const filteredCreations = creations.filter((c) => {
    if (showOnlyAvailable && (c.sold || c.reserved)) {
      return false;
    }
    if (selectedColors.length > 0 && !selectedColors.includes(c.color || "")) {
      return false;
    }
    return true;
  });

  return (
    <>
      <div className="mx-auto max-w-5xl px-4 py-8">
        {creations.length === 0 && (
          <p className="text-sm text-slate-500">
            Aucune création pour le moment.
          </p>
        )}

        {availableColors.length > 0 && (
          <Filters
            availableColors={availableColors}
            selectedColors={selectedColors}
            onColorChange={setSelectedColors}
            showOnlyAvailable={showOnlyAvailable}
            onAvailabilityChange={setShowOnlyAvailable}
          />
        )}

        {filteredCreations.length > 0 && (
          <section className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCreations.map((creation) => (
              <CreationCard
                key={creation._id}
                creation={creation}
                onClick={() => openModal(creation)}
              />
            ))}
          </section>
        )}

        {creations.length > 0 && filteredCreations.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">
            Aucune création ne correspond à ces filtres.
          </p>
        )}
      </div>

      <CreationModal
        creation={openCreation}
        isOpen={showModal}
        onClose={closeModal}
        onReserve={handleReserve}
      />
    </>
  );
}
