"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button, Accordion } from "@/components/ui";
import { optimizeCloudinaryUrl } from "@/lib/imageOptimizer";
import { useCart } from "@/contexts/CartContext";
import { Toast } from "@/components/Toast";
import { CreationCard } from "@/components/CreationCard";

export type Creation = {
  _id: string;
  slug?: string;
  title: string;
  description?: string;
  seoDescription?: string;
  imageUrl?: string;
  images?: string[];
  price?: number;
  color?: string;
  type?: "bonnet" | "tour de cou" | "bandeau";
  sold?: boolean;
  showAsNew?: boolean;
  createdAt?: string;
  visibleAt?: string; // Date de première mise en ligne (décompte "nouveau" à partir de là)
  relatedCreations?: Array<{
    _id: string;
    slug?: string;
    title: string;
    imageUrl?: string;
    images?: string[];
    price?: number;
    color?: string;
    type?: string;
  }>;
};

interface CreationDetailProps {
  creation: Creation;
}

// SVG encodés pour les curseurs personnalisés (Cercle blanc + Flèche noire + Ombre)
// Cela permet d'utiliser l'image comme curseur CSS
const cursorLeft = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="white" stroke="%23e2e8f0" stroke-width="1"/><path d="M24 12l-8 8 8 8" stroke="black" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="20" r="19" fill="none" stroke="black" stroke-opacity="0.1" stroke-width="2"/></svg>') 20 20, auto`;

const cursorRight = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="white" stroke="%23e2e8f0" stroke-width="1"/><path d="M16 12l8 8-8 8" stroke="black" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="20" r="19" fill="none" stroke="black" stroke-opacity="0.1" stroke-width="2"/></svg>') 20 20, auto`;

// Composant Bouton Flèche (utilisé uniquement dans la Lightbox)
const ArrowButton = ({ direction, onClick, className = "" }: { direction: 'left' | 'right', onClick: (e: React.MouseEvent) => void, className?: string }) => (
  <button
    onClick={onClick}
    className={`hidden md:flex absolute top-1/2 -translate-y-1/2 z-50 items-center justify-center 
    w-12 h-12 bg-white rounded-full shadow-lg text-slate-900 transition-all duration-200 
    hover:scale-110 hover:bg-gray-50 active:scale-95 cursor-pointer border border-gray-100 ${className} 
    ${direction === 'left' ? 'left-4' : 'right-4'}`}
    aria-label={direction === 'left' ? "Image précédente" : "Image suivante"}
  >
    {direction === 'left' ? (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
    ) : (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
    )}
  </button>
);

export function CreationDetail({ creation }: CreationDetailProps) {
  const router = useRouter();
  const { addItem, items } = useCart();
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const isInCart = items.some((item) => item.creationId === creation._id);
  
  // États UI
  const [thumbnailScroll, setThumbnailScroll] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const [justAddedToCart, setJustAddedToCart] = useState(false);
  const relatedCreationsScrollRef = useRef<HTMLDivElement>(null);
  const [isHoveringRelated, setIsHoveringRelated] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // --- REFS POUR LE SCROLL MOBILE ---
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const interactionSourceRef = useRef<'scroll' | 'select'>('select');

  // --- ÉTATS MODALE ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const modalScrollRef = useRef<HTMLDivElement>(null);
  
  // Zoom & Pan
  const [modalZoomLevel, setModalZoomLevel] = useState(1);
  const [modalPan, setModalPan] = useState({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number, y: number } | null>(null);
  const isPanningRef = useRef(false);

  const images = creation?.images && creation.images.length > 0 
    ? creation.images 
    : creation?.imageUrl 
      ? [creation.imageUrl] 
      : [];

  // Décompte "nouveau" : 7 jours depuis visibleAt (si défini) ou createdAt
  const refDate = creation.visibleAt || creation.createdAt;
  const isNewArticle = creation.showAsNew && refDate
    ? (new Date().getTime() - new Date(refDate).getTime()) / (1000 * 60 * 60 * 24) < 7
    : creation.showAsNew;

  // Préchargement des images principales (800px)
  useEffect(() => {
    if (images.length > 0) {
      images.forEach((src) => {
        const img = new Image();
        img.src = optimizeCloudinaryUrl(src, { width: 800, quality: 80, format: 'auto' });
      });
    }
  }, [images]);

  // Préchargement des images haute résolution pour la lightbox (en arrière-plan)
  useEffect(() => {
    if (images.length === 0) return;

    // Fonction pour précharger les images haute résolution
    const preloadLightboxImages = () => {
      images.forEach((src) => {
        const img = new Image();
        img.src = optimizeCloudinaryUrl(src, { width: 1200, quality: 85, format: 'auto' });
      });
    };

    // Utiliser requestIdleCallback si disponible, sinon attendre que la page soit chargée
    if (typeof window !== 'undefined') {
      if ('requestIdleCallback' in window && typeof (window as any).requestIdleCallback === 'function') {
        // Précharger pendant les périodes d'inactivité du navigateur
        (window as any).requestIdleCallback(preloadLightboxImages, { timeout: 2000 });
      } else {
        // Fallback : attendre que la page soit complètement chargée + délai
        const handleLoad = () => {
          setTimeout(preloadLightboxImages, 1000);
        };
        
        if (document.readyState === 'complete') {
          setTimeout(preloadLightboxImages, 1000);
        } else {
          window.addEventListener('load', handleLoad);
          return () => window.removeEventListener('load', handleLoad);
        }
      }
    }
  }, [images]);

  // Bloquer scroll body si modale ouverte
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
      setTimeout(() => {
        if (modalScrollRef.current) {
          modalScrollRef.current.scrollTo({
             left: currentIndex * window.innerWidth, 
             behavior: 'instant' 
          });
        }
      }, 10);
    } else {
      document.body.style.overflow = "unset";
      resetModalZoomState();
    }
    return () => { document.body.style.overflow = "unset"; };
  }, [isModalOpen]);

  // Gestion Clavier
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") changeImage(currentIndex + 1);
      else if (e.key === "ArrowLeft") changeImage(currentIndex - 1);
      else if (e.key === "Escape") setIsModalOpen(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentIndex]);

  // Scroll Sync Mobile
  useEffect(() => {
    const container = mobileScrollRef.current;
    if (!container) return;
    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      const width = container.offsetWidth;
      const newIndex = Math.round(scrollLeft / width);
      if (newIndex !== currentIndex) {
        interactionSourceRef.current = 'scroll';
        setCurrentIndex(newIndex);
      }
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [currentIndex]);

  useEffect(() => {
    const container = mobileScrollRef.current;
    if (container && window.innerWidth < 768 && !isModalOpen) {
        if (interactionSourceRef.current === 'scroll') {
            interactionSourceRef.current = 'select';
            return;
        }
        const targetScroll = currentIndex * container.offsetWidth;
        container.scrollTo({ left: targetScroll, behavior: 'smooth' });
    }
  }, [currentIndex, isModalOpen]);

  // Scroll Sync Modale
  useEffect(() => {
    const modalContainer = modalScrollRef.current;
    if (!modalContainer || !isModalOpen) return;

    const handleModalScroll = () => {
      if (modalZoomLevel > 1) return;
      const scrollLeft = modalContainer.scrollLeft;
      const width = modalContainer.offsetWidth;
      const newIndex = Math.round(scrollLeft / width);
      if (newIndex !== currentIndex) setCurrentIndex(newIndex);
    };

    modalContainer.addEventListener('scroll', handleModalScroll, { passive: true });
    return () => modalContainer.removeEventListener('scroll', handleModalScroll);
  }, [isModalOpen, modalZoomLevel, currentIndex]);

  function changeImage(newIndex: number) {
    if (images.length <= 1) return;
    const validIndex = (newIndex + images.length) % images.length;
    interactionSourceRef.current = 'select';
    setCurrentIndex(validIndex);
    
    if (isModalOpen && modalScrollRef.current) {
        // Sur PC, utiliser 'instant' pour une transition plus rapide
        const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
        modalScrollRef.current.scrollTo({
            left: validIndex * window.innerWidth,
            behavior: isDesktop ? 'instant' : 'smooth'
        });
    }
  }

  function nextImage(e?: React.MouseEvent) { e?.stopPropagation(); changeImage(currentIndex + 1); }
  function prevImage(e?: React.MouseEvent) { e?.stopPropagation(); changeImage(currentIndex - 1); }

  // --- LOGIQUE MODALE ---

  function resetModalZoomState() {
      setModalZoomLevel(1);
      setModalPan({ x: 0, y: 0 });
  }

  function openModal() { setIsModalOpen(true); }

  // Pan Handlers
  function handlePanStart(clientX: number, clientY: number) {
    if (modalZoomLevel === 1) return;
    panStartRef.current = { x: clientX - modalPan.x, y: clientY - modalPan.y };
    isPanningRef.current = false;
  }

  function handlePanMove(clientX: number, clientY: number, e: any) {
    if (modalZoomLevel === 1 || !panStartRef.current) return;
    e.preventDefault();
    isPanningRef.current = true;
    setModalPan({ x: clientX - panStartRef.current.x, y: clientY - panStartRef.current.y });
  }

  // Unified Handlers
  const onTouchStart = (e: React.TouchEvent) => handlePanStart(e.touches[0].clientX, e.touches[0].clientY);
  const onTouchMove = (e: React.TouchEvent) => handlePanMove(e.touches[0].clientX, e.touches[0].clientY, e);
  const onMouseDown = (e: React.MouseEvent) => { if(modalZoomLevel > 1) { e.preventDefault(); handlePanStart(e.clientX, e.clientY); } };
  const onMouseMove = (e: React.MouseEvent) => { if(e.buttons === 1) handlePanMove(e.clientX, e.clientY, e); };
  const onMouseUp = () => { panStartRef.current = null; setTimeout(() => { isPanningRef.current = false; }, 50); };

  // Clic Intelligent (Zoom ciblé)
  function handleImageClick(e: React.MouseEvent) {
    e.stopPropagation(); 
    if (isPanningRef.current) { isPanningRef.current = false; panStartRef.current = null; return; }

    if (modalZoomLevel === 1) {
        const rect = e.currentTarget.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const deltaX = centerX - offsetX;
        const deltaY = centerY - offsetY;
        setModalPan({ x: deltaX * 1.5, y: deltaY * 1.5 });
        setModalZoomLevel(2.5);
    } else {
        resetModalZoomState();
    }
  }

  function scrollThumbnailsUp() { setThumbnailScroll((prev) => Math.max(0, prev - 1)); }
  function scrollThumbnailsDown() { setThumbnailScroll((prev) => Math.min(images.length - 4, prev + 1)); }
  
  function handleAddToCart() { if (creation.sold || isInCart) return; addItem({ creationId: creation._id, slug: creation.slug, title: creation.title, imageUrl: creation.images && creation.images.length > 0 ? creation.images[0] : creation.imageUrl, price: creation.price }); setJustAddedToCart(true); setTimeout(() => setJustAddedToCart(false), 2000); if (typeof window !== "undefined" && window.innerWidth < 768) setShowToast(true); }

  const checkScrollButtons = () => { if (!relatedCreationsScrollRef.current) return; const { scrollLeft, scrollWidth, clientWidth } = relatedCreationsScrollRef.current; setCanScrollLeft(scrollLeft > 0); setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1); };
  const scrollRelatedCreations = (direction: 'left' | 'right') => { if (!relatedCreationsScrollRef.current) return; const scrollAmount = 300; const currentScroll = relatedCreationsScrollRef.current.scrollLeft; relatedCreationsScrollRef.current.scrollTo({ left: direction === 'left' ? currentScroll - scrollAmount : currentScroll + scrollAmount, behavior: 'smooth' }); };
  useEffect(() => { const scrollContainer = relatedCreationsScrollRef.current; if (scrollContainer) { checkScrollButtons(); scrollContainer.addEventListener('scroll', checkScrollButtons); window.addEventListener('resize', checkScrollButtons); return () => { scrollContainer.removeEventListener('scroll', checkScrollButtons); window.removeEventListener('resize', checkScrollButtons); }; } }, [creation.relatedCreations]);

  const currentImageUrl = images[currentIndex]
    ? optimizeCloudinaryUrl(images[currentIndex], { width: 800, quality: 80, format: 'auto' })
    : undefined;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-24 md:pb-8">
      <button onClick={() => router.push(`/#creation-${creation.slug || creation._id}`)} className="relative z-50 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6 cursor-pointer">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Retour aux créations
      </button>

      <div className="grid gap-4 md:gap-8 md:grid-cols-2">
        <div className="flex flex-col md:flex-row gap-2 md:gap-2 md:items-center">
          
          {/* Miniatures Desktop */}
          {images.length > 1 && (
            <div className="hidden md:flex md:flex-col md:w-24 relative items-center justify-center">
               {images.length > 4 && <button onClick={scrollThumbnailsUp} disabled={thumbnailScroll === 0} className="mb-1 rounded-full bg-white/90 p-1.5 shadow-lg hover:bg-white cursor-pointer disabled:opacity-50"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg></button>}
              <div className="flex flex-col gap-1.5 overflow-hidden px-1 py-1" style={{ height: '318px' }}><div className="flex flex-col gap-1.5 transition-transform duration-300" style={{ transform: `translateY(-${thumbnailScroll * 77.5}px)` }}>{images.map((img, idx) => (<button key={idx} onClick={() => { interactionSourceRef.current = 'select'; setCurrentIndex(idx); }} className={`aspect-square overflow-hidden rounded-lg cursor-pointer transition-all ${idx === currentIndex ? "ring-2 ring-slate-900 opacity-100" : "ring-1 ring-slate-300 opacity-60 hover:opacity-100"}`} style={{ width: '76px', height: '76px', flexShrink: 0 }}><img src={optimizeCloudinaryUrl(img, { width: 200, quality: 70, format: 'auto' })} alt={`Miniature ${idx + 1}`} title={`${creation.title} - Miniature ${idx + 1}`} className="h-full w-full object-cover" /></button>))}</div></div>
              {images.length > 4 && <button onClick={scrollThumbnailsDown} disabled={thumbnailScroll >= images.length - 4} className="mt-1 rounded-full bg-white/90 p-1.5 shadow-lg hover:bg-white cursor-pointer disabled:opacity-50"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></button>}
            </div>
          )}

          {/* Wrapper Image Principal */}
          <div className="flex-1 flex flex-col w-full relative"> 
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-100 shadow-lg group">
              
              {/* --- SWIPE MOBILE --- */}
              <div 
                ref={mobileScrollRef}
                className="md:hidden flex h-full w-full overflow-x-auto scrollbar-hide snap-x snap-mandatory"
                style={{ touchAction: 'pan-x pan-y' }}
              >
                {images.map((img, idx) => (
                    <div key={idx} className="relative h-full w-full shrink-0 snap-center flex items-center justify-center cursor-pointer" onClick={openModal}>
                      <img src={optimizeCloudinaryUrl(img, { width: 800, quality: 80, format: 'auto' })} alt={`Image ${idx + 1}`} title={`${creation.title} - Image ${idx + 1}`} className="h-full w-full object-contain" draggable={false} />
                    </div>
                ))}
              </div>

              {/* --- DESKTOP IMAGE VIEW --- */}
              <div className="hidden md:block h-full w-full relative" > {/* Retrait de cursor-zoom-in global */}
                {currentImageUrl ? (
                    <>
                    <img src={currentImageUrl} alt="Main" title={creation.title} className="h-full w-full object-contain" draggable={false} />
                    
                    {/* --- ZONES DE NAVIGATION AVEC CURSEUR PERSONNALISÉ --- */}
                    {images.length > 1 && (
                      <>
                        {/* Zone Gauche */}
                        <div 
                            className="absolute top-0 left-0 w-1/2 h-full z-10" 
                            style={{ cursor: cursorLeft }}
                            onClick={prevImage}
                            title="Précédent"
                        />
                        {/* Zone Droite */}
                        <div 
                            className="absolute top-0 right-0 w-1/2 h-full z-10" 
                            style={{ cursor: cursorRight }}
                            onClick={nextImage}
                            title="Suivant"
                        />
                      </>
                    )}
                    </>
                ) : <div className="flex h-full items-center justify-center text-slate-400">Pas d&apos;image</div>}
              </div>

            </div>

            {/* LOUPE FIXE */}
            {/* z-20 pour être au-dessus des zones de navigation */}
            <button 
                onClick={(e) => { e.stopPropagation(); openModal(); }} 
                className="absolute bottom-12 right-4 md:bottom-4 md:right-4 z-20 cursor-pointer transition-transform hover:scale-110 active:scale-95"
                aria-label="Ouvrir le zoom"
            >
                <div className="bg-black/50 hover:bg-black/70 p-2.5 rounded-full text-white backdrop-blur-sm shadow-sm transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                </div>
            </button>

            {/* Indicateurs Mobile */}
             {images.length > 1 && (
              <div className="md:hidden flex justify-center gap-2 mt-4">
                {images.map((_, idx) => <div key={idx} className={`h-2 w-2 rounded-full transition-colors duration-300 ${idx === currentIndex ? "bg-slate-800" : "bg-slate-300"}`} />)}
              </div>
            )}
          </div>
        </div>

        {/* Informations (inchangé) */}
        <div className="space-y-6 md:sticky md:top-8 md:self-start">
            <div><h1 className="text-3xl font-bold text-slate-900">{creation.title}</h1>{creation.price && <div className="mt-3 flex items-center gap-3 flex-wrap"><span className="text-3xl font-bold text-slate-900">{Number.isInteger(creation.price) ? creation.price : creation.price.toFixed(2)} €</span>{creation.sold ? <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">Vendu</span> : isNewArticle ? <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">Nouveau</span> : null}</div>}</div>
            <div className="space-y-3">{!creation.sold ? <Button onClick={handleAddToCart} disabled={isInCart || justAddedToCart} className={`w-full cursor-pointer transition-all duration-300 ${justAddedToCart ? "bg-green-500 hover:bg-green-500 scale-105" : ""}`} size="lg">{justAddedToCart ? "✓ Ajouté !" : isInCart ? "Déjà dans le panier" : "Ajouter au panier"}</Button> : <><div className="rounded-lg p-3 text-center bg-gray-100"><p className="font-medium text-gray-900">Article vendu</p><p className="mt-1 text-sm text-gray-600">Cet article n'est plus disponible</p></div><Button onClick={() => router.push(`/contact?subject=commande&creation=${creation._id}`)} className="w-full cursor-pointer bg-slate-900 hover:bg-slate-800 text-white" size="lg">Commander un article identique</Button></>}</div>
        </div>
      </div>

      <div className="mt-8 md:mt-12 max-w-4xl"><Accordion items={[{ title: "Description", content: creation.seoDescription || creation.description || "Aucune description disponible.", renderAsHtml: !!creation.seoDescription }, ...(creation.description && creation.description !== creation.seoDescription ? [{ title: "Composition", content: creation.description, renderAsHtml: false }] : [])]} defaultOpen={0} /></div>

      {creation.relatedCreations && creation.relatedCreations.length > 0 && <div className="mt-12 md:mt-16 relative" onMouseEnter={() => setIsHoveringRelated(true)} onMouseLeave={() => setIsHoveringRelated(false)}><h2 className="text-2xl font-bold text-slate-900 mb-6">Vous pourriez aussi aimer</h2><div className="relative -mx-4 px-4">{canScrollLeft && <button onClick={() => scrollRelatedCreations('left')} className={`absolute left-6 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/90 p-2 shadow-lg hover:bg-white transition-opacity duration-200 ${isHoveringRelated ? 'opacity-100' : 'opacity-0'}`}><svg className="h-5 w-5 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>}{canScrollRight && <button onClick={() => scrollRelatedCreations('right')} className={`absolute right-6 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/90 p-2 shadow-lg hover:bg-white transition-opacity duration-200 ${isHoveringRelated ? 'opacity-100' : 'opacity-0'}`}><svg className="h-5 w-5 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>}<div ref={relatedCreationsScrollRef} className="overflow-x-auto scrollbar-hide"><div className="flex gap-6 pb-2">{creation.relatedCreations.map((relatedCreation) => (<div key={relatedCreation._id} className="shrink-0 w-64 md:w-72"><CreationCard creation={{ ...relatedCreation, type: relatedCreation.type as "bonnet" | "tour de cou" | "bandeau" | undefined }} priority={false} /></div>))}</div></div></div></div>}

      {/* --- MODALE FULLSCREEN --- */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center animate-in fade-in duration-200"
          onClick={() => setIsModalOpen(false)}
        >
          {/* Bouton fermer */}
          <button className="absolute top-4 right-4 p-4 text-white/80 hover:text-white z-50 cursor-pointer">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>

          {/* FLÈCHE GAUCHE STYLÉE (MODALE) */}
          {images.length > 1 && <ArrowButton direction="left" onClick={prevImage} className="fixed" />}

          {/* Container Scrollable */}
          <div 
            ref={modalScrollRef}
            className={`w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide ${modalZoomLevel > 1 ? 'overflow-hidden' : ''}`} 
            style={{ touchAction: modalZoomLevel > 1 ? 'none' : 'pan-x' }}
          >
             {images.map((img, idx) => (
                <div 
                    key={idx} 
                    className="shrink-0 w-full h-full snap-center flex items-center justify-center"
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseUp}
                >
                    <img
                        src={optimizeCloudinaryUrl(img, { width: 1200, quality: 85, format: 'auto' })}
                        alt={`Zoom ${idx}`}
                        title={`${creation.title} - Vue détaillée ${idx + 1}`}
                        onClick={handleImageClick}
                        className="max-h-screen max-w-screen object-contain transition-transform duration-200 ease-out will-change-transform"
                        style={{ 
                            transform: idx === currentIndex 
                                ? `translate(${modalPan.x}px, ${modalPan.y}px) scale(${modalZoomLevel})` 
                                : 'scale(1)',
                            cursor: modalZoomLevel > 1 ? 'grab' : 'zoom-in'
                        }}
                        draggable={false}
                    />
                </div>
             ))}
          </div>
          
          {/* FLÈCHE DROITE STYLÉE (MODALE) */}
          {images.length > 1 && <ArrowButton direction="right" onClick={nextImage} className="fixed" />}

          {/* Indicateurs (Dots) dans la modale */}
          {images.length > 1 && modalZoomLevel === 1 && (
            <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-2 pointer-events-none">
              {images.map((_, idx) => (
                <div key={idx} className={`h-2 w-2 rounded-full transition-colors duration-300 ${idx === currentIndex ? "bg-white" : "bg-white/30"}`} />
              ))}
            </div>
          )}
        </div>
      )}

      <Toast message="Article ajouté au panier" isVisible={showToast} onClose={() => setShowToast(false)} cartUrl="/cart" />
    </div>
  );
}