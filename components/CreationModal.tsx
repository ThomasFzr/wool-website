"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Creation } from "./CreationCard";
import { Button, Badge } from "./ui";

interface CreationModalProps {
  creation: Creation | null;
  isOpen: boolean;
  onClose: () => void;
  onReserve?: (creation: Creation) => Promise<void>;
  hideActions?: boolean;
}

export function CreationModal({ creation, isOpen, onClose, onReserve, hideActions = false }: CreationModalProps) {
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

  useEffect(() => {
    if (!isOpen) {
      setCurrentIndex(0);
      setZoomed(false);
      setOffset({ x: 0, y: 0 });
      setScale(1);
      setJustReserved(false);
    }
  }, [isOpen]);

  // Désactiver le scroll de la page quand la modale est ouverte
  useEffect(() => {
    if (isOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = "unset";
      document.body.style.paddingRight = "0px";
    }

    return () => {
      document.body.style.overflow = "unset";
      document.body.style.paddingRight = "0px";
    };
  }, [isOpen]);

  // Gestion clavier
  useEffect(() => {
    if (!isOpen) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight") {
        nextImage();
      } else if (e.key === "ArrowLeft") {
        prevImage();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, currentIndex]);

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

  async function handleReserve() {
    if (!creation || !onReserve) return;
    
    setReserveLoading(true);
    try {
      await onReserve(creation);
      setJustReserved(true);
    } catch (error) {
      console.error(error);
    } finally {
      setReserveLoading(false);
    }
  }

  if (!creation) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 transition-opacity duration-150 ${
        isOpen ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-xl transform-gpu transition-all duration-150 ${
          isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
          aria-label="Fermer"
        >
          ✕
        </button>

        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">
            {creation.title}
          </h2>
          {creation.description && (
            <p className="mt-1 whitespace-pre-line text-xs text-slate-600">
              {creation.description}
            </p>
          )}
        </div>

        <div
          className="relative h-[500px] w-full overflow-hidden rounded-xl bg-slate-100 touch-pan-y"
          onMouseDown={(e) => {
            if (!zoomed) return;
            e.preventDefault();
            setIsDragging(true);
            setHasDragged(false);
            setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
          }}
          onMouseMove={(e) => {
            if (!zoomed || !isDragging || !dragStart) return;
            e.preventDefault();
            setHasDragged(true);
            const newX = e.clientX - dragStart.x;
            const newY = e.clientY - dragStart.y;
            setOffset({ x: newX, y: newY });
          }}
          onMouseUp={() => {
            setIsDragging(false);
          }}
          onMouseLeave={() => {
            setIsDragging(false);
          }}
          onTouchStart={(e) => {
            const touches = e.touches;

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

            if (!zoomed) {
              setSwipeStartX(t.clientX);
            }

            if (zoomed) {
              setIsDragging(true);
              setHasDragged(false);
              setDragStart({ x: t.clientX - offset.x, y: t.clientY - offset.y });
            }
          }}
          onTouchMove={(e) => {
            const touches = e.touches;

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

            if (zoomed && isDragging && dragStart && touches.length === 1) {
              e.preventDefault();
              setHasDragged(true);
              const t = touches[0];
              const newX = t.clientX - dragStart.x;
              const newY = t.clientY - dragStart.y;
              setOffset({ x: newX, y: newY });
              return;
            }

            if (!zoomed && swipeStartX !== null && touches.length === 1) {
              const t = touches[0];
              const delta = t.clientX - swipeStartX;
              setSwipeDeltaX(delta);
            }
          }}
          onTouchEnd={() => {
            if (pinchStartDistance !== null) {
              setPinchStartDistance(null);
              setIsDragging(false);
              return;
            }

            if (!zoomed) {
              if (swipeDeltaX > 60) prevImage();
              if (swipeDeltaX < -60) nextImage();
            }
            setSwipeStartX(null);
            setSwipeDeltaX(0);
            setIsDragging(false);
          }}
        >
          {images.length > 0 ? (
            <img
              src={images[currentIndex]}
              alt={`${creation.title} ${currentIndex + 1}`}
              onClick={() => {
                // Ne pas dé-zoomer si on vient de drag
                if (hasDragged) {
                  setHasDragged(false);
                  return;
                }
                
                if (!zoomed) {
                  setZoomed(true);
                  setScale(1.7);
                } else {
                  setZoomed(false);
                  setScale(1);
                  setOffset({ x: 0, y: 0 });
                }
              }}
              className={`h-full w-full object-contain transition-transform duration-300 select-none ${
                zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
              }`}
              style={{
                transform: zoomed
                  ? `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`
                  : `translateX(${swipeDeltaX}px) scale(1)`,
                transformOrigin: "center center",
              }}
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
              Pas d&apos;image
            </div>
          )}

          {images.length > 1 && (
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
                {currentIndex + 1} / {images.length}
              </span>
            </>
          )}
        </div>

        {images.length > 1 && (
          <div className="mt-3 flex items-center gap-2 overflow-x-auto">
            {images.map((url, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`h-14 w-14 shrink-0 rounded-md border ${
                  i === currentIndex ? "border-slate-900" : "border-transparent opacity-60"
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

        <div className="mt-4 flex items-center justify-between">
          {!hideActions && (
            <div className="flex items-center gap-2">
              {justReserved ? (
                <p className="text-sm font-medium text-green-600">
                  Article bien réservé ✔️
                </p>
              ) : creation.sold ? (
                <p className="text-sm font-medium text-slate-700">
                  Cet article est déjà vendu.
                </p>
              ) : creation.reserved ? (
                <p className="text-sm font-medium text-red-600">
                  Cet article est déjà réservé.
                </p>
              ) : !session ? (
                <Button size="sm" onClick={() => signIn()}>
                  Se connecter pour réserver
                </Button>
              ) : (
                <Button 
                  size="sm" 
                  onClick={handleReserve}
                  disabled={reserveLoading}
                >
                  {reserveLoading ? "Réservation..." : "Réserver"}
                </Button>
              )}

              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  onClose();
                  router.push(`/contact?creation=${creation._id}`);
                }}
              >
                📧 Contacter
              </Button>
            </div>
          )}

          {creation.price != null && (
            <Badge variant="default" className={`text-sm font-semibold py-2 whitespace-nowrap px-4 bg-slate-900 text-white ${hideActions ? 'ml-auto' : ''}`}>
              {creation.price} €
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
