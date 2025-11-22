"use client";

import { useEffect, useRef, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";

type Creation = {
  _id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  images?: string[];
  price?: number;
  color?: string;
  reserved?: boolean;
  sold?: boolean;

};

type Settings = {
  title: string;
  subtitle: string;
};


export default function HomePage() {
  // Authentication session
  const { data: session, status } = useSession();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const [creations, setCreations] = useState<Creation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  // Pinch-to-zoom state
  const [scale, setScale] = useState(1);
  const [pinchStartDistance, setPinchStartDistance] = useState<number | null>(null);
  const [pinchStartScale, setPinchStartScale] = useState(1);

  //Reservation states
  const [reserveLoading, setReserveLoading] = useState(false);
  const [justReserved, setJustReserved] = useState(false);

  const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
  const [swipeDeltaX, setSwipeDeltaX] = useState(0);

  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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

          // on supporte soit un objet, soit un tableau
          const s = Array.isArray(data) ? data[0] : data;

          if (s && (s.title || s.subtitle)) {
            setSettings({
              title: s.title,
              subtitle: s.subtitle,
            });
          } else {
            console.warn("Settings API ne renvoie pas title/subtitle:", data);
          }
        } else {
          console.error("Erreur /api/settings:", settingsRes.status);
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

  function getImages(c: Creation): string[] {
    if (c.images && c.images.length > 0) return c.images;
    if (c.imageUrl) return [c.imageUrl];
    return [];
  }

  function openModal(c: Creation) {
    const imgs = getImages(c);
    setCurrentIndex(0);
    setOpenId(c._id);
    setJustReserved(false);
    if (imgs.length === 0) setCurrentIndex(0);
    setShowModal(true);
  }

  function reallyCloseModal() {
    setOpenId(null);
    setShowModal(false);
  }

  function closeModal() {
    setZoomed(false);
    setOffset({ x: 0, y: 0 });
    setIsDragging(false);
    setDragStart(null);

    setShowModal(false);
    setTimeout(() => {
      setOpenId(null);
    }, 150);
  }

  async function handleReserve() {
    if (!openCreation || !session?.user) return;

    const name = session.user.name || "";
    const contact = session.user.email || "";

    if (!name || !contact) {
      alert("Impossible de récupérer vos informations. Veuillez vous reconnecter.");
      return;
    }

    try {
      setReserveLoading(true);
      const res = await fetch(`/api/creations/${openCreation._id}/reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          contact,
        }),
      });

      if (res.status === 409) {
        alert("Cet article vient déjà d'être réservé.");
        setReserveLoading(false);
        return;
      }
      if (!res.ok) {
        alert("Erreur lors de la réservation, réessayez plus tard.");
        setReserveLoading(false);
        return;
      }

      // Mise à jour locale : marquer l'article comme réservé
      setCreations((prev) =>
        prev.map((c) =>
          c._id === openCreation._id
            ? { ...c, reserved: true }
            : c
        )
      );

      // Message de succès
      setJustReserved(true);
    } catch (e) {
      console.error(e);
      alert("Erreur réseau, réessayez plus tard.");
    } finally {
      setReserveLoading(false);
    }
  }

  function startDrag(clientX: number, clientY: number) {
    if (!zoomed) return;
    setIsDragging(true);
    setDragStart({ x: clientX - offset.x, y: clientY - offset.y });
  }

  function moveDrag(clientX: number, clientY: number) {
    if (!zoomed || !isDragging || !dragStart) return;
    const newX = clientX - dragStart.x;
    const newY = clientY - dragStart.y;
    setOffset({ x: newX, y: newY });
  }

  function endDrag() {
    setIsDragging(false);
  }

  function nextImage() {
    if (!openId) return;
    const c = creations.find((x) => x._id === openId);
    if (!c) return;
    const imgs = getImages(c);
    if (imgs.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % imgs.length);
  }

  function prevImage() {
    if (!openId) return;
    const c = creations.find((x) => x._id === openId);
    if (!c) return;
    const imgs = getImages(c);
    if (imgs.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + imgs.length) % imgs.length);
  }

  // Gestion clavier: Esc / flèches
  useEffect(() => {
    if (!openId) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeModal();
      } else if (e.key === "ArrowRight") {
        nextImage();
      } else if (e.key === "ArrowLeft") {
        prevImage();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, currentIndex, creations]);

  const openCreation = openId
    ? creations.find((c) => c._id === openId) || null
    : null;
  const openImages = openCreation ? getImages(openCreation) : [];

  const rawColors = Array.from(
    new Set(
      creations
        .map((c) => c.color?.trim())
        .filter((c): c is string => Boolean(c))
    )
  );

  const sortedColors = rawColors.sort((a, b) => {
    if (a.toLowerCase() === "multicolore") return 1;
    if (b.toLowerCase() === "multicolore") return -1;
    return a.localeCompare(b);
  });

  const availableColors = [...sortedColors];

  const filteredCreations =
    selectedColor && selectedColor !== "all"
      ? creations.filter((c) => c.color === selectedColor)
      : creations;

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-5xl font-bold tracking-tight">
              {settings?.title}
            </h1>
            <p className="mt-2 text-2xl text-slate-600">
              {settings?.subtitle}
            </p>
          </div>

          <div className="relative" ref={menuRef}>
            {/* Bouton avatar */}
            <button
              type="button"
              onClick={() => {
                if (!session) {
                  // 🔥 Si pas connecté → ouverture directe de la page de connexion
                  signIn();
                } else {
                  // 🔥 Si connecté → on ouvre/ferme le menu
                  setAccountMenuOpen((o) => !o);
                }
              }}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              {/* ROND AVATAR */}
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-[13px] font-semibold text-white">
                {session
                  ? (session.user?.name?.[0]?.toUpperCase() ??
                    session.user?.email?.[0]?.toUpperCase() ??
                    "👤")
                  : "👤"}
              </span>

              {/* TEXTE À CÔTÉ DU ROND */}
              <span className="hidden sm:inline">
                {session ? "Mon compte" : "Se connecter"}
              </span>
            </button>

            {/* Menu déroulant (uniquement si connecté) */}
            {session && accountMenuOpen && (
              <div className="absolute right-0 z-10 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg animate-fadeIn">

                <a
                  href="/account"
                  className="w-full block px-4 py-2 text-left text-sm hover:bg-slate-100"
                  onClick={() => setAccountMenuOpen(false)}
                >
                  Mon compte
                </a>

                <a
                  href="/account/orders"
                  className="w-full block px-4 py-2 text-left text-sm hover:bg-slate-100"
                  onClick={() => setAccountMenuOpen(false)}
                >
                  Mes commandes
                </a>

                <div className="border-t border-slate-200" />

                <button
                  onClick={() => signOut()}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  Se déconnecter
                </button>
              </div>
            )}
          </div>
        </header>

        {/* États de chargement / erreur */}
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

        {/* Filtres couleur */}
        {!loading && !error && availableColors.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-600">Filtrer par couleur :</span>
            <button
              type="button"
              onClick={() => setSelectedColor(null)}
              className={`rounded-full border px-3 py-1 ${!selectedColor
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700"
                }`}
            >
              Toutes
            </button>
            {availableColors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setSelectedColor(color)}
                className={`rounded-full border px-3 py-1 ${selectedColor === color
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700"
                  }`}
              >
                {color}
              </button>
            ))}
          </div>
        )}

        {/* Galerie */}
        {!loading && !error && filteredCreations.length > 0 && (
          <section className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCreations.map((c) => {
              const imgs = getImages(c);
              const cover = imgs[0];

              return (
                <article
                  key={c._id}
                  className="relative flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-1 hover:shadow-md"
                  onClick={() => openModal(c)}
                >
                  {c.sold ? (
                    <span className="absolute left-2 top-2 z-10 rounded-full bg-slate-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Vendu
                    </span>
                  ) : c.reserved ? (
                    <span className="absolute left-2 top-2 z-10 rounded-full bg-red-500 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Réservé
                    </span>
                  ) : null}
                  <div className="relative h-56 w-full overflow-hidden bg-slate-100">
                    {cover ? (
                      <img
                        src={cover}
                        alt={c.title}
                        className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
                        Pas d&apos;image
                      </div>
                    )}
                    {imgs.length > 1 && (
                      <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                        {imgs.length} photos
                      </span>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-slate-900">
                        {c.title}
                      </h2>
                      <div className="flex items-center gap-2">
                        {c.price != null && (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">
                            {c.price} €
                          </span>
                        )}
                      </div>
                    </div>

                    {c.description && (
                      <p className="line-clamp-3 whitespace-pre-line text-xs text-slate-600">
                        {c.description}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {/* Message si aucun résultat après filtre */}
        {!loading && !error && creations.length > 0 && filteredCreations.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">
            Aucune création ne correspond à cette couleur pour le moment.
          </p>
        )}
      </div>

      {/* Modal / Lightbox */}
      {(openCreation || showModal) && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 transition-opacity duration-150 ${showModal ? "opacity-100" : "opacity-0"
            }`}
          onClick={closeModal} // clic sur le fond => ferme
        >
          <div
            className={`relative w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-xl transform-gpu transition-all duration-150 ${showModal ? "opacity-100 scale-100" : "opacity-0 scale-95"
              }`}
            onClick={(e) => e.stopPropagation()} // clic dans le contenu => ne ferme pas
          >
            {openCreation && (
              <>
                {/* Bouton fermer (mobile seulement) - croix en haut à droite */}
                <button
                  onClick={closeModal}
                  className="absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black sm:hidden"
                  aria-label="Fermer"
                >
                  ✕
                </button>

                {/* Infos titre + description */}
                <div className="mb-3">
                  <h2 className="text-sm font-semibold text-slate-900">
                    {openCreation.title}
                  </h2>
                  {openCreation.description && (
                    <p className="mt-1 whitespace-pre-line text-xs text-slate-600">
                      {openCreation.description}
                    </p>
                  )}
                </div>

                {/* Image principale */}
                <div
                  className="relative h-[500px] w-full overflow-hidden rounded-xl bg-slate-100 touch-pan-y"
                  // DESKTOP DRAG (only when zoomed)
                  onMouseDown={(e) => {
                    if (!zoomed) return;
                    setIsDragging(true);
                    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
                  }}
                  onMouseMove={(e) => {
                    if (!zoomed || !isDragging || !dragStart) return;
                    const newX = e.clientX - dragStart.x;
                    const newY = e.clientY - dragStart.y;
                    setOffset({ x: newX, y: newY });
                  }}
                  onMouseUp={() => setIsDragging(false)}
                  onMouseLeave={() => setIsDragging(false)}
                  // MOBILE: double-tap zoom + swipe + pinch zoom
                  onTouchStart={(e) => {
                    const touches = e.touches;

                    // PINCH START (two fingers)
                    if (touches.length === 2) {
                      const dx = touches[0].clientX - touches[1].clientX;
                      const dy = touches[0].clientY - touches[1].clientY;
                      const dist = Math.sqrt(dx * dx + dy * dy);
                      setPinchStartDistance(dist);
                      setPinchStartScale(scale || 1);
                      setZoomed(true);
                      setSwipeStartX(null);
                      setSwipeDeltaX(0);
                      return;
                    }

                    const t = touches[0];

                    const now = Date.now();
                    if ((window as any).lastTap && now - (window as any).lastTap < 280) {
                      // DOUBLE TAP → TOGGLE ZOOM
                      if (!zoomed) {
                        setZoomed(true);
                        setScale(1.7);
                      } else {
                        setZoomed(false);
                        setScale(1);
                        setOffset({ x: 0, y: 0 });
                      }
                      (window as any).lastTap = 0;
                      return;
                    }
                    (window as any).lastTap = now;

                    // start swipe
                    if (!zoomed) {
                      setSwipeStartX(t.clientX);
                    }

                    // start drag if zoomed (one finger)
                    if (zoomed) {
                      setIsDragging(true);
                      setDragStart({ x: t.clientX - offset.x, y: t.clientY - offset.y });
                    }
                  }}
                  onTouchMove={(e) => {
                    const touches = e.touches;

                    // PINCH MOVE
                    if (touches.length === 2 && pinchStartDistance !== null) {
                      const dx = touches[0].clientX - touches[1].clientX;
                      const dy = touches[0].clientY - touches[1].clientY;
                      const dist = Math.sqrt(dx * dx + dy * dy);
                      const factor = dist / pinchStartDistance;
                      const newScale = Math.min(3, Math.max(1, pinchStartScale * factor));
                      setScale(newScale);
                      setZoomed(newScale > 1.02);
                      return;
                    }

                    // DRAG MODE (one finger, zoomed)
                    if (zoomed && isDragging && dragStart && touches.length === 1) {
                      const t = touches[0];
                      const newX = t.clientX - dragStart.x;
                      const newY = t.clientY - dragStart.y;
                      setOffset({ x: newX, y: newY });
                      return;
                    }

                    // SWIPE MODE (only if NOT zoomed)
                    if (!zoomed && swipeStartX !== null && touches.length === 1) {
                      const t = touches[0];
                      const delta = t.clientX - swipeStartX;
                      setSwipeDeltaX(delta);
                    }
                  }}
                  onTouchEnd={(e) => {
                    // Fin d'un pinch → on arrête juste le pinch/drag
                    if (pinchStartDistance !== null) {
                      setPinchStartDistance(null);
                      setIsDragging(false);
                      return;
                    }

                    // Swipe (si pas zoomé)
                    if (!zoomed) {
                      if (swipeDeltaX > 60) prevImage();
                      if (swipeDeltaX < -60) nextImage();
                    }
                    setSwipeStartX(null);
                    setSwipeDeltaX(0);
                    setIsDragging(false);
                  }}
                >
                  {openImages.length > 0 ? (
                    <img
                      src={openImages[currentIndex]}
                      alt={`${openCreation.title} ${currentIndex + 1}`}
                      onClick={() => {
                        // CLICK (desktop) → zoom toggle
                        if (!zoomed) {
                          setZoomed(true);
                          setScale(1.7);
                        } else {
                          setZoomed(false);
                          setScale(1);
                          setOffset({ x: 0, y: 0 });
                        }
                      }}
                      className={`
        h-full w-full object-contain transition-transform duration-300 select-none
        ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}
      `}
                      style={{
                        transform: zoomed
                          ? `scale(${scale}) translate(${offset.x}px, ${offset.y}px)`
                          : `translateX(${swipeDeltaX}px) scale(1)`,
                      }}
                      draggable={false}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
                      Pas d&apos;image
                    </div>
                  )}

                  {/* Flèches + indicateur */}
                  {openImages.length > 1 && (
                    <>
                      <button
                        onClick={prevImage}
                        className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-2 py-1 text-xs text-white hover:bg-black"
                      >
                        ◀
                      </button>
                      <button
                        onClick={nextImage}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-2 py-1 text-xs text-white hover:bg-black"
                      >
                        ▶
                      </button>
                      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                        {currentIndex + 1} / {openImages.length}
                      </span>
                    </>
                  )}
                </div>
                {/* ——————————————————————————————— */}
                {/*   MINIATURES au-dessus du bloc prix/réservation */}
                {/* ——————————————————————————————— */}
                {openImages.length > 1 && (
                  <div className="mt-3 flex items-center gap-2 overflow-x-auto">
                    {openImages.map((url, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentIndex(i)}
                        className={`h-14 w-14 shrink-0 rounded-md border ${i === currentIndex ? "border-slate-900" : "border-transparent opacity-60"
                          }`}
                      >
                        <img
                          src={url}
                          alt={`miniature ${i + 1}`}
                          className="h-full w-full rounded-md object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}

                {/* Ligne bouton réserver + prix */}
                <div className="mt-4 flex items-center justify-between">
                  {/* Priorité : état de l'article */}
                  {openCreation.sold ? (
                    // ✅ Cas vendu
                    <p className="text-sm font-medium text-slate-700">
                      Cet article est déjà vendu.
                    </p>
                  ) : openCreation.reserved ? (
                    // ✅ Cas déjà réservé
                    <p className="text-sm font-medium text-red-600">
                      Cet article est déjà réservé.
                    </p>
                  ) : !session ? (
                    // ✅ Article dispo mais user non connecté
                    <button
                      onClick={() => signIn()}
                      className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      Se connecter pour réserver
                    </button>
                  ) : justReserved ? (
                    // ✅ Article que l'utilisateur vient de réserver
                    <p className="text-sm font-medium text-green-600">
                      Article bien réservé ✔️
                    </p>
                  ) : (
                    // ✅ User connecté, article dispo : bouton de réservation directe
                    <button
                      onClick={handleReserve}
                      disabled={reserveLoading}
                      className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {reserveLoading ? "Réservation..." : "Réserver cet article"}
                    </button>
                  )}

                  {openCreation.price != null && (
                    <span className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                      {openCreation.price} €
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}