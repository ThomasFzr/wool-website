"use client";

import { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button, Badge } from "@/components/ui";
import { optimizeCloudinaryUrl } from "@/lib/imageOptimizer";

export type Creation = {
  _id: string;
  slug?: string;
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
  reservedByUserId?: string | null;
};

interface CreationDetailProps {
  creation: Creation;
  currentUserId?: string;
}

export function CreationDetail({ creation, currentUserId }: CreationDetailProps) {
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
  const [isSwiping, setIsSwiping] = useState(false);
  const [thumbnailScroll, setThumbnailScroll] = useState(0);

  // Vérifier si l'utilisateur connecté est celui qui a réservé l'article
  const isReservedByCurrentUser = currentUserId && creation.reservedByUserId === currentUserId;

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

  // Auto-scroll des miniatures pour suivre l'image actuelle
  useEffect(() => {
    if (images.length <= 4) return;
    
    // Si l'image actuelle n'est pas dans la fenêtre visible (4 miniatures)
    if (currentIndex < thumbnailScroll) {
      // Scroller vers le haut pour montrer l'image actuelle en première position
      setThumbnailScroll(currentIndex);
    } else if (currentIndex >= thumbnailScroll + 4) {
      // Scroller vers le bas pour montrer l'image actuelle en dernière position
      setThumbnailScroll(Math.max(0, currentIndex - 3));
    } else if (currentIndex === thumbnailScroll + 3 && currentIndex < images.length - 1) {
      // Si on est sur la 4ème miniature visible et qu'il y en a d'autres après, scroll d'un cran
      setThumbnailScroll(thumbnailScroll + 1);
    }
  }, [currentIndex, images.length, thumbnailScroll]);

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

  function scrollThumbnailsUp() {
    setThumbnailScroll((prev) => Math.max(0, prev - 1));
  }

  function scrollThumbnailsDown() {
    setThumbnailScroll((prev) => Math.min(images.length - 4, prev + 1));
  }

  function toggleZoom() {
    if (zoomed) {
      setZoomed(false);
      setScale(1);
      setOffset({ x: 0, y: 0 });
    } else {
      setZoomed(true);
      setScale(2.5);
    }
  }

  // Gestion du drag (desktop)
  function handleMouseDown(e: React.MouseEvent) {
    if (!zoomed) return;
    e.preventDefault();
    setIsDragging(true);
    setHasDragged(false);
    setDragStart({ x: e.clientX, y: e.clientY });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDragging || !dragStart || !zoomed) return;
    e.preventDefault();
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      setHasDragged(true);
    }
    setOffset((prev) => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
    setDragStart({ x: e.clientX, y: e.clientY });
  }

  function handleMouseUp(e: React.MouseEvent) {
    setIsDragging(false);
    setDragStart(null);
    setTimeout(() => setHasDragged(false), 100);
  }

  function handleImageClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!hasDragged) {
      toggleZoom();
    }
  }

  // Gestion pinch-to-zoom (mobile)
  function getTouchDistance(touches: React.TouchList) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      // Pinch zoom
      e.preventDefault();
      const dist = getTouchDistance(e.touches);
      setPinchStartDistance(dist);
      setPinchStartScale(scale);
      setIsSwiping(false);
    } else if (e.touches.length === 1) {
      if (zoomed) {
        // Drag en mode zoom
        setIsDragging(true);
        setHasDragged(false);
        setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
        setIsSwiping(false);
      } else {
        // Swipe pour changer d'image - on enregistre juste la position
        setSwipeStartX(e.touches[0].clientX);
        setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
        setSwipeDeltaX(0);
        setIsSwiping(true);
      }
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchStartDistance !== null) {
      // Pinch zoom
      e.preventDefault();
      const dist = getTouchDistance(e.touches);
      const newScale = pinchStartScale * (dist / pinchStartDistance);
      const clampedScale = Math.max(1, Math.min(4, newScale));
      setScale(clampedScale);
      if (clampedScale > 1.1) {
        setZoomed(true);
        setIsSwiping(false);
      } else {
        setZoomed(false);
        setOffset({ x: 0, y: 0 });
      }
    } else if (e.touches.length === 1) {
      if (isDragging && dragStart && zoomed) {
        // Drag en mode zoom
        e.preventDefault();
        const deltaX = e.touches[0].clientX - dragStart.x;
        const deltaY = e.touches[0].clientY - dragStart.y;
        if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
          setHasDragged(true);
        }
        setOffset((prev) => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
        setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      } else if (swipeStartX !== null && !zoomed && isSwiping) {
        // Swipe pour navigation - seulement si mouvement horizontal
        const deltaX = e.touches[0].clientX - swipeStartX;
        const deltaY = e.touches[0].clientY - (dragStart?.y || e.touches[0].clientY);
        
        // Détecter si c'est un swipe horizontal ou vertical
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
          // Swipe horizontal - changer d'image
          e.preventDefault();
          setSwipeDeltaX(deltaX);
        }
        // Si c'est vertical, on laisse le scroll de la page se faire naturellement
      }
    }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (e.touches.length === 0) {
      setPinchStartDistance(null);
      
      if (isDragging && zoomed) {
        setIsDragging(false);
        setDragStart(null);
        // Pas de dézoom sur drag, seulement sur tap
        setTimeout(() => setHasDragged(false), 0);
      } else if (!hasDragged && zoomed && !isSwiping) {
        // Tap pour dézoomer
        toggleZoom();
      }
      
      if (swipeStartX !== null && !zoomed && isSwiping) {
        if (Math.abs(swipeDeltaX) > 50) {
          if (swipeDeltaX > 0) {
            prevImage();
          } else {
            nextImage();
          }
        }
        setSwipeStartX(null);
        setSwipeDeltaX(0);
        setIsSwiping(false);
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
      <button 
        onClick={() => router.push(`/#creation-${creation.slug || creation._id}`)} 
        className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6 cursor-pointer"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Retour aux créations
      </button>

      <div className="grid gap-4 md:gap-8 md:grid-cols-2">
        {/* Galerie d'images */}
        <div className="flex flex-col md:flex-row gap-2 md:gap-2 md:items-center">
          {/* Miniatures - À gauche sur desktop uniquement */}
          {images.length > 1 && (
            <div className="hidden md:flex md:flex-col md:w-24 relative items-center justify-center">
              {/* Flèche haut */}
              {images.length > 4 && (
                <button
                  onClick={scrollThumbnailsUp}
                  disabled={thumbnailScroll === 0}
                  className="mb-1 rounded-full bg-white/90 p-1.5 shadow-lg hover:bg-white cursor-pointer transition-all hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Miniatures précédentes"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
              )}
              
              {/* Container avec scroll */}
              <div className="flex flex-col gap-1.5 overflow-hidden px-1 py-1" style={{ height: '318px' }}>
                <div 
                  className="flex flex-col gap-1.5 transition-transform duration-300"
                  style={{ transform: `translateY(-${thumbnailScroll * 77.5}px)` }}
                >
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setCurrentIndex(idx);
                        setZoomed(false);
                        setScale(1);
                        setOffset({ x: 0, y: 0 });
                      }}
                      className={`aspect-square overflow-hidden rounded-lg cursor-pointer transition-all ${
                        idx === currentIndex 
                          ? "ring-2 ring-slate-900 opacity-100" 
                          : "ring-1 ring-slate-300 opacity-60 hover:opacity-100"
                      }`}
                      style={{ width: '76px', height: '76px', flexShrink: 0 }}
                    >
                      <img
                        src={optimizeCloudinaryUrl(img, { width: 200, quality: 70, format: 'auto' })}
                        alt={`Miniature ${idx + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Flèche bas */}
              {images.length > 4 && (
                <button
                  onClick={scrollThumbnailsDown}
                  disabled={thumbnailScroll >= images.length - 4}
                  className="mt-1 rounded-full bg-white/90 p-1.5 shadow-lg hover:bg-white cursor-pointer transition-all hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Miniatures suivantes"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Image principale */}
          <div className="flex-1 relative aspect-square overflow-hidden rounded-2xl bg-slate-100 shadow-lg">
            {currentImageUrl ? (
              <div
                className="relative h-full w-full overflow-hidden touch-none"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onClick={handleImageClick}
                style={{ touchAction: zoomed ? 'none' : 'pan-y' }}
              >
                <div
                  className="h-full w-full transition-transform"
                  style={{
                    transform: !zoomed && isSwiping ? `translateX(${swipeDeltaX}px)` : 'none',
                    transition: !zoomed && isSwiping ? 'none' : 'transform 0.3s ease-out',
                  }}
                >
                  <img
                    src={currentImageUrl}
                    alt={`${creation.title} - Image ${currentIndex + 1}`}
                    className="h-full w-full object-contain transition-transform duration-150 ease-out will-change-transform"
                    style={{
                      transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                      cursor: zoomed ? (isDragging ? "grabbing" : "zoom-out") : "zoom-in",
                    }}
                    draggable={false}
                  />
                </div>
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

            {/* Navigation images - Desktop uniquement */}
            {images.length > 1 && (
              <>
                <button
                  onClick={prevImage}
                  className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-lg hover:bg-white cursor-pointer transition-all hover:scale-110 items-center justify-center"
                  aria-label="Image précédente"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={nextImage}
                  className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-lg hover:bg-white cursor-pointer transition-all hover:scale-110 items-center justify-center"
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
        </div>

        {/* Informations */}
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{creation.title}</h1>
            {creation.price && (
              <div className="mt-3">
                <span className="text-3xl font-bold text-slate-900">
                  {Number.isInteger(creation.price) ? creation.price : creation.price.toFixed(2)} €
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {creation.color && <Badge>{creation.color.charAt(0).toUpperCase() + creation.color.slice(1)}</Badge>}
            {creation.type && <Badge>{creation.type.charAt(0).toUpperCase() + creation.type.slice(1)}</Badge>}
          </div>

          {creation.description && (
            <div className="prose prose-slate max-w-none">
              <p className="text-slate-700 whitespace-pre-wrap">{creation.description}</p>
            </div>
          )}

          {/* Actions - Desktop */}
          <div className="hidden md:block space-y-3">
            {!creation.reserved && !creation.sold && !justReserved ? (
              <Button
                onClick={handleReserve}
                disabled={reserveLoading}
                className="w-full cursor-pointer"
                size="lg"
              >
                {reserveLoading ? "Réservation..." : "Réserver"}
              </Button>
            ) : (
              <>
                <div className={`rounded-lg p-4 text-center ${
                  creation.sold ? "bg-gray-100" :
                  isReservedByCurrentUser ? "bg-blue-50" :
                  justReserved ? "bg-green-50" : "bg-red-50"
                }`}>
                  <p className={`font-medium ${
                    creation.sold ? "text-gray-900" :
                    isReservedByCurrentUser ? "text-blue-900" :
                    justReserved ? "text-green-900" : "text-red-900"
                  }`}>
                    {creation.sold ? "Article vendu" :
                     isReservedByCurrentUser ? "Vous avez réservé cet article" :
                     justReserved ? "Réservé avec succès !" : "Article déjà réservé"}
                  </p>
                  {justReserved && (
                    <p className="mt-1 text-sm text-green-700">
                      Vous recevrez un email de confirmation.
                    </p>
                  )}
                  {isReservedByCurrentUser && (
                    <p className="mt-1 text-sm text-blue-700">
                      Nous vous contacterons pour finaliser la vente.
                    </p>
                  )}
                  {(creation.sold || (creation.reserved && !isReservedByCurrentUser)) && (
                    <p className="mt-1 text-sm text-gray-600">
                      Cet article n'est plus disponible
                    </p>
                  )}
                </div>
                {(creation.sold || (creation.reserved && !isReservedByCurrentUser)) && (
                  <Button
                    onClick={() => router.push(`/contact?subject=commande&creation=${creation._id}`)}
                    className="w-full cursor-pointer bg-slate-900 hover:bg-slate-800 text-white"
                    size="lg"
                  >
                    Commander un article identique
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Actions */}
      <div className="md:hidden p-4 space-y-2">
        {!creation.reserved && !creation.sold && !justReserved ? (
          <Button
            onClick={handleReserve}
            disabled={reserveLoading}
            className="w-full cursor-pointer"
            size="lg"
          >
            {reserveLoading ? "Réservation..." : "Réserver"}
          </Button>
        ) : (
          <>
            <div className={`rounded-lg p-3 text-center ${
              creation.sold ? "bg-gray-100" :
              isReservedByCurrentUser ? "bg-blue-50" :
              justReserved ? "bg-green-50" : "bg-red-50"
            }`}>
              <p className={`text-sm font-medium ${
                creation.sold ? "text-gray-900" :
                isReservedByCurrentUser ? "text-blue-900" :
                justReserved ? "text-green-900" : "text-red-900"
              }`}>
                {creation.sold ? "Article vendu" :
                 isReservedByCurrentUser ? "Vous avez réservé cet article" :
                 justReserved ? "Réservé avec succès !" : "Article déjà réservé"}
              </p>
              {justReserved && (
                <p className="mt-1 text-xs text-green-700">
                  Vous recevrez un email de confirmation.
                </p>
              )}
              {isReservedByCurrentUser && (
                <p className="mt-1 text-xs text-blue-700">
                  Nous vous contacterons pour finaliser la vente.
                </p>
              )}
              {(creation.sold || (creation.reserved && !isReservedByCurrentUser)) && (
                <p className="mt-1 text-xs text-gray-600">
                  Cet article n'est plus disponible
                </p>
              )}
            </div>
            {(creation.sold || (creation.reserved && !isReservedByCurrentUser)) && (
              <Button
                onClick={() => router.push(`/contact?subject=commande&creation=${creation._id}`)}
                className="w-full cursor-pointer bg-slate-900 hover:bg-slate-800 text-white"
                size="lg"
              >
                Commander un article identique
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
