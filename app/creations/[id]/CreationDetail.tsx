"use client";

import { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Badge } from "@/components/ui";
import { optimizeCloudinaryUrl } from "@/lib/imageOptimizer";

export type Creation = {
  _id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  images?: string[];
  price?: number;
  color?: string;
  type?: "bonnet" | "tour de cou" | "bandeau";
  reserved?: boolean;
  sold?: boolean;
  showAsNew?: boolean;
  createdAt?: string;
};

interface CreationDetailProps {
  creation: Creation;
}

export function CreationDetail({ creation }: CreationDetailProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [pinchStartDistance, setPinchStartDistance] = useState<number | null>(null);
  const [pinchStartScale, setPinchStartScale] = useState(1);
  const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
  const [swipeDeltaX, setSwipeDeltaX] = useState(0);
  const [reserveLoading, setReserveLoading] = useState(false);
  const [justReserved, setJustReserved] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);

  const images = creation?.images && creation.images.length > 0 
    ? creation.images 
    : creation?.imageUrl 
      ? [creation.imageUrl] 
      : [];

  // Vérifier si l'article est nouveau (moins de 7 jours)
  const isNewArticle = creation.showAsNew && creation.createdAt 
    ? (new Date().getTime() - new Date(creation.createdAt).getTime()) / (1000 * 60 * 60 * 24) < 7
    : creation.showAsNew;

  // Précharger toutes les images
  useEffect(() => {
    if (images.length > 0) {
      images.forEach((src) => {
        const img = new Image();
        img.src = optimizeCloudinaryUrl(src, { width: 800, quality: 80, format: 'auto' });
      });
    }
  }, [images]);

  // Gestion clavier
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") {
        nextImage();
      } else if (e.key === "ArrowLeft") {
        prevImage();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentIndex]);

  function nextImage() {
    if (images.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % images.length);
    setZoomed(false);
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  function prevImage() {
    if (images.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    setZoomed(false);
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  function toggleZoom() {
    if (zoomed) {
      setZoomed(false);
      setScale(1);
      setOffset({ x: 0, y: 0 });
    } else {
      setZoomed(true);
      setScale(2);
    }
  }

  // Gestion du drag (desktop)
  function handleMouseDown(e: React.MouseEvent) {
    if (!zoomed) return;
    setIsDragging(true);
    setHasDragged(false);
    setDragStart({ x: e.clientX, y: e.clientY });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDragging || !dragStart || !zoomed) return;
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      setHasDragged(true);
    }
    setOffset((prev) => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
    setDragStart({ x: e.clientX, y: e.clientY });
  }

  function handleMouseUp(e: React.MouseEvent) {
    setIsDragging(false);
    setDragStart(null);
    if (!hasDragged && zoomed) {
      toggleZoom();
    }
    setTimeout(() => setHasDragged(false), 0);
  }

  // Gestion pinch-to-zoom (mobile)
  function getTouchDistance(touches: React.TouchList) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dist = getTouchDistance(e.touches);
      setPinchStartDistance(dist);
      setPinchStartScale(scale);
    } else if (e.touches.length === 1) {
      if (zoomed) {
        setIsDragging(true);
        setHasDragged(false);
        setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      } else {
        setSwipeStartX(e.touches[0].clientX);
        setSwipeDeltaX(0);
      }
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchStartDistance !== null) {
      const dist = getTouchDistance(e.touches);
      const newScale = pinchStartScale * (dist / pinchStartDistance);
      const clampedScale = Math.max(1, Math.min(4, newScale));
      setScale(clampedScale);
      if (clampedScale > 1) {
        setZoomed(true);
      } else {
        setZoomed(false);
        setOffset({ x: 0, y: 0 });
      }
    } else if (e.touches.length === 1) {
      if (isDragging && dragStart && zoomed) {
        const deltaX = e.touches[0].clientX - dragStart.x;
        const deltaY = e.touches[0].clientY - dragStart.y;
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
          setHasDragged(true);
        }
        setOffset((prev) => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
        setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      } else if (swipeStartX !== null && !zoomed) {
        const deltaX = e.touches[0].clientX - swipeStartX;
        setSwipeDeltaX(deltaX);
      }
    }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (e.touches.length === 0) {
      setPinchStartDistance(null);
      if (isDragging) {
        setIsDragging(false);
        setDragStart(null);
        if (!hasDragged && zoomed) {
          toggleZoom();
        }
        setTimeout(() => setHasDragged(false), 0);
      }
      if (swipeStartX !== null && !zoomed) {
        if (Math.abs(swipeDeltaX) > 50) {
          if (swipeDeltaX > 0) {
            prevImage();
          } else {
            nextImage();
          }
        }
        setSwipeStartX(null);
        setSwipeDeltaX(0);
      }
    }
  }

  async function handleReserve() {
    if (!session?.user) {
      signIn();
      return;
    }

    setReserveLoading(true);

    const name = session.user.name || "";
    const contact = session.user.email || "";

    if (!name || !contact) {
      alert("Impossible de récupérer vos informations. Veuillez vous reconnecter.");
      setReserveLoading(false);
      return;
    }

    const res = await fetch(`/api/creations/${creation._id}/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, contact }),
    });

    setReserveLoading(false);

    if (res.status === 409) {
      alert("Cet article vient déjà d'être réservé.");
      router.refresh();
      return;
    }
    if (!res.ok) {
      alert("Erreur lors de la réservation, réessayez plus tard.");
      return;
    }

    setJustReserved(true);
    router.refresh();
  }

  const currentImageUrl = images[currentIndex]
    ? optimizeCloudinaryUrl(images[currentIndex], { width: 800, quality: 80, format: 'auto' })
    : undefined;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-24 md:pb-8">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Retour aux créations
      </Link>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Galerie d'images */}
        <div className="space-y-4">
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-100 shadow-lg">
            {currentImageUrl ? (
              <div
                className="relative h-full w-full cursor-zoom-in overflow-hidden"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onClick={(e) => {
                  if (!hasDragged && !zoomed) {
                    toggleZoom();
                  }
                }}
                style={{ touchAction: zoomed ? "none" : "auto" }}
              >
                <img
                  src={currentImageUrl}
                  alt={`${creation.title} - Image ${currentIndex + 1}`}
                  className="h-full w-full object-contain transition-transform duration-200"
                  style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                    cursor: zoomed ? (isDragging ? "grabbing" : "grab") : "zoom-in",
                  }}
                  draggable={false}
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400">
                Pas d&apos;image
              </div>
            )}

            {/* Badges */}
            {creation.sold ? (
              <span className="absolute left-4 top-4 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                Vendu
              </span>
            ) : creation.reserved || justReserved ? (
              <span className="absolute left-4 top-4 rounded-full bg-red-500 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                Réservé
              </span>
            ) : isNewArticle ? (
              <span className="absolute left-4 top-4 rounded-full bg-red-500 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                Nouveau
              </span>
            ) : null}

            {/* Navigation images */}
            {images.length > 1 && (
              <>
                <button
                  onClick={prevImage}
                  className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-lg hover:bg-white"
                  aria-label="Image précédente"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-lg hover:bg-white"
                  aria-label="Image suivante"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm text-white">
                  {currentIndex + 1} / {images.length}
                </div>
              </>
            )}
          </div>

          {/* Miniatures */}
          {images.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCurrentIndex(idx);
                    setZoomed(false);
                    setScale(1);
                    setOffset({ x: 0, y: 0 });
                  }}
                  className={`aspect-square overflow-hidden rounded-lg ${
                    idx === currentIndex ? "ring-2 ring-slate-900" : "ring-1 ring-slate-200"
                  }`}
                >
                  <img
                    src={optimizeCloudinaryUrl(img, { width: 200, quality: 70, format: 'auto' })}
                    alt={`Miniature ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Informations */}
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{creation.title}</h1>
            {creation.price && (
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {creation.price.toFixed(2)} €
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {creation.color && <Badge>{creation.color}</Badge>}
            {creation.type && <Badge>{creation.type}</Badge>}
          </div>

          {creation.description && (
            <div className="prose prose-slate max-w-none">
              <p className="text-slate-700 whitespace-pre-wrap">{creation.description}</p>
            </div>
          )}

          {/* Actions - Desktop */}
          {!creation.sold && (
            <div className="hidden md:block space-y-3">
              {!creation.reserved && !justReserved ? (
                <Button
                  onClick={handleReserve}
                  disabled={reserveLoading}
                  className="w-full"
                  size="lg"
                >
                  {reserveLoading ? "Réservation..." : "Réserver cet article"}
                </Button>
              ) : (
                <div className="rounded-lg bg-red-50 p-4 text-center">
                  <p className="font-medium text-red-900">
                    {justReserved ? "Réservé avec succès !" : "Article déjà réservé"}
                  </p>
                  {justReserved && (
                    <p className="mt-1 text-sm text-red-700">
                      Vous recevrez un email de confirmation.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sticky Button - Mobile */}
      {!creation.sold && (
        <div className="fixed bottom-0 left-0 right-0 md:hidden p-4 z-50">
          {!creation.reserved && !justReserved ? (
            <Button
              onClick={handleReserve}
              disabled={reserveLoading}
              className="w-full"
              size="lg"
            >
              {reserveLoading ? "Réservation..." : "Réserver cet article"}
            </Button>
          ) : (
            <div className="rounded-lg bg-red-50 p-3 text-center">
              <p className="text-sm font-medium text-red-900">
                {justReserved ? "Réservé avec succès !" : "Article déjà réservé"}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
