"use client";

import { useEffect, useState } from "react";
// import Link from "next/link"; // tu peux le remettre si tu gardes un lien admin

type Creation = {
  _id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  images?: string[];
  price?: number;
};

export default function HomePage() {
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

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/creations", { cache: "no-store" });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        setCreations(data);
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

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Les créations en laine de maman 🧶
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Clique sur une création pour voir toutes les photos.
            </p>
          </div>
          {/* Bouton admin caché si tu ne veux pas qu'il soit visible */}
          {/* <Link ...> */}
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

        {/* Galerie */}
        {!loading && !error && creations.length > 0 && (
          <section className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {creations.map((c) => {
              const imgs = getImages(c);
              const cover = imgs[0];

              return (
                <article
                  key={c._id}
                  className="flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-1 hover:shadow-md"
                  onClick={() => openModal(c)}
                >
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
                      {c.price != null && (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">
                          {c.price} €
                        </span>
                      )}
                    </div>

                    {c.description && (
                      <p className="line-clamp-3 text-xs text-slate-600">
                        {c.description}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
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
            className={`relative w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl transform-gpu transition-all duration-150 ${showModal ? "opacity-100 scale-100" : "opacity-0 scale-95"
              }`}
            onClick={(e) => e.stopPropagation()} // clic dans le contenu => ne ferme pas
          >
            {openCreation && (
              <>

                {/* Infos titre + description + prix */}
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      {openCreation.title}
                    </h2>
                    {openCreation.description && (
                      <p className="mt-1 text-xs text-slate-600">
                        {openCreation.description}
                      </p>
                    )}
                  </div>
                  {openCreation.price != null && (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">
                      {openCreation.price} €
                    </span>
                  )}
                </div>

                {/* Image principale */}
                <div
                  className="relative h-[600px] w-full overflow-hidden rounded-xl bg-slate-100"
                  // souris
                  onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
                  onMouseMove={(e) => moveDrag(e.clientX, e.clientY)}
                  onMouseUp={endDrag}
                  onMouseLeave={endDrag}
                  // tactile
                  onTouchStart={(e) => {
                    const t = e.touches[0];
                    startDrag(t.clientX, t.clientY);
                  }}
                  onTouchMove={(e) => {
                    const t = e.touches[0];
                    moveDrag(t.clientX, t.clientY);
                  }}
                  onTouchEnd={endDrag}
                >
                  {openImages.length > 0 ? (
                    <img
                      src={openImages[currentIndex]}
                      alt={`${openCreation.title} ${currentIndex + 1}`}
                      onClick={() => {
                        // toggle zoom au clic
                        if (!zoomed) {
                          setZoomed(true);
                        } else {
                          // dézoom => reset position
                          setZoomed(false);
                          setOffset({ x: 0, y: 0 });
                        }
                      }}
                      className={`
        h-full w-full object-cover transition-transform duration-300
        ${zoomed ? "cursor-grab" : "cursor-zoom-in"}
        ${isDragging && zoomed ? "cursor-grabbing" : ""}
      `}
                      style={{
                        transform: zoomed
                          ? `scale(1.7) translate(${offset.x}px, ${offset.y}px)`
                          : "scale(1) translate(0px, 0px)",
                      }}
                      draggable={false}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
                      Pas d&apos;image
                    </div>
                  )}

                  {/* Flèches + indicateur (inchangé) */}
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

                {/* Miniatures */}
                {openImages.length > 1 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto">
                    {openImages.map((url, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentIndex(i)}
                        className={`h-14 w-14 shrink-0 rounded-md border ${i === currentIndex
                          ? "border-slate-900"
                          : "border-transparent opacity-60"
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

                {/* Astuce clavier */}
                {openImages.length > 1 && (
                  <p className="mt-2 text-[11px] text-slate-500">
                    Astuce&nbsp;: flèches ← → pour changer de photo, Esc pour fermer.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}