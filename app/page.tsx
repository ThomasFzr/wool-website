"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/Header";
import { CreationCard, Creation } from "@/components/CreationCard";
import { CreationModal } from "@/components/CreationModal";
import { Filters } from "@/components/Filters";

type Settings = {
  title: string;
  subtitle: string;
};

export default function HomePage() {
  const { data: session } = useSession();
  const [creations, setCreations] = useState<Creation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openCreation, setOpenCreation] = useState<Creation | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(false);
  const [pendingReservations, setPendingReservations] = useState(0);
  const [newMessages, setNewMessages] = useState(0);

  // Charger les créations et settings
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [creationsRes, settingsRes] = await Promise.all([
          fetch("/api/creations", { cache: "no-store" }),
          fetch("/api/settings", { cache: "no-store" }),
        ]);

        if (!creationsRes.ok) throw new Error(`Status ${creationsRes.status}`);

        const creationsData = await creationsRes.json();
        setCreations(creationsData);

        if (settingsRes.ok) {
          const data = await settingsRes.json();
          const s = Array.isArray(data) ? data[0] : data;

          if (s && (s.title || s.subtitle)) {
            setSettings({
              title: s.title,
              subtitle: s.subtitle,
            });
          }
        }
      } catch (e) {
        console.error(e);
        setError("Impossible de charger les créations.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // Charger le nombre de réservations en attente et messages si admin
  useEffect(() => {
    async function loadAdminNotifications() {
      if (session?.user?.role === "admin") {
        try {
          const [reservationsRes, messagesRes] = await Promise.all([
            fetch("/api/admin/reservations/count"),
            fetch("/api/admin/contact/count"),
          ]);

          if (reservationsRes.ok) {
            const data = await reservationsRes.json();
            setPendingReservations(data.pending || 0);
          }

          if (messagesRes.ok) {
            const data = await messagesRes.json();
            setNewMessages(data.new || 0);
          }
        } catch (err) {
          console.error(err);
        }
      }
    }

    loadAdminNotifications();
  }, [session]);

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
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Header
          title={settings?.title}
          subtitle={settings?.subtitle}
          pendingReservations={pendingReservations}
          newMessages={newMessages}
        />

        {loading && (
          <p className="text-sm text-slate-500">Chargement des créations...</p>
        )}

        {!loading && error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        {!loading && !error && creations.length === 0 && (
          <p className="text-sm text-slate-500">
            Aucune création pour le moment.
          </p>
        )}

        {!loading && !error && availableColors.length > 0 && (
          <Filters
            availableColors={availableColors}
            selectedColors={selectedColors}
            onColorChange={setSelectedColors}
            showOnlyAvailable={showOnlyAvailable}
            onAvailabilityChange={setShowOnlyAvailable}
          />
        )}

        {!loading && !error && filteredCreations.length > 0 && (
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

        {!loading && !error && creations.length > 0 && filteredCreations.length === 0 && (
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
    </main>
  );
}
