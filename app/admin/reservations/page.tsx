"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Badge, Card, Input } from "@/components";

type Creation = {
    _id: string;
    title: string;
    images?: string[];
    imageUrl?: string;
    price?: number;
    color?: string;
    description?: string;
};

type Reservation = {
    _id: string;
    name: string;
    contact: string;
    message?: string;
    status: "pending" | "validated" | "cancelled";
    createdAt: string;
    cancelReason?: string;
    cancelledBy?: "admin" | "user";
    creationId?: Creation | null;
};

export default function AdminReservations() {
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [selected, setSelected] = useState<Reservation | null>(null);
    const [showValidateConfirm, setShowValidateConfirm] = useState(false);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [cancelReason, setCancelReason] = useState("");
    const [showCreationModal, setShowCreationModal] = useState(false);
    const [selectedCreation, setSelectedCreation] = useState<Creation | null>(null);

    async function load() {
        const params = new URLSearchParams({
            page: page.toString(),
            limit: "10",
        });

        if (search) params.set("search", search);
        if (statusFilter) params.set("status", statusFilter);

        const res = await fetch("/api/admin/reservations?" + params.toString());
        const data: {
            reservations: Reservation[];
            page: number;
            totalPages: number;
            total: number;
        } = await res.json();

        setReservations(data.reservations);
        setPage(data.page);
        setTotalPages(data.totalPages);
        setSelected(null);
        setShowValidateConfirm(false);
        setShowCancelConfirm(false);
        setCancelReason("");
    }

    useEffect(() => {
        load();
    }, [page, search, statusFilter]);

    async function updateStatus(id: string, status: string) {
        const body: any = { status };
        if (status === "cancelled" && cancelReason.trim()) {
            body.cancelReason = cancelReason.trim();
        }
        
        await fetch(`/api/admin/reservations/${id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
        });
        load();
    }

    async function deleteReservation(id: string) {
        await fetch(`/api/admin/reservations/${id}`, { method: "DELETE" });
        load();
    }

    const getStatusBadgeVariant = (status: string) => {
        if (status === "pending") return "warning";
        if (status === "validated") return "success";
        return "danger";
    };

    const getStatusLabel = (status: string) => {
        if (status === "pending") return "En attente";
        if (status === "validated") return "Validée";
        return "Annulée";
    };

    const pendingCount = reservations.filter(r => r.status === "pending").length;
    const totalCount = reservations.length;

    return (
        <main className="min-h-screen bg-slate-50">
            <div className="mx-auto max-w-6xl px-4 py-6">
                {/* Header */}
                <div className="mb-6">
                    <Link
                        href="/admin"
                        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-3"
                    >
                        ← Retour à l&apos;administration
                    </Link>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                                📋 Réservations
                            </h1>
                            <p className="text-sm text-slate-600 mt-1">
                                {totalCount} réservation{totalCount > 1 ? "s" : ""} au total
                                {pendingCount > 0 && (
                                    <span className="text-orange-600 font-medium">
                                        {" "} • {pendingCount} en attente
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Filtres */}
                <Card className="p-4 mb-6">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-[200px]">
                            <Input
                                placeholder="🔍 Rechercher par nom, email..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                        >
                            <option value="">📊 Tous les statuts</option>
                            <option value="pending">⏳ En attente</option>
                            <option value="validated">✅ Validées</option>
                            <option value="cancelled">❌ Annulées</option>
                        </select>
                    </div>
                </Card>

                {/* Liste des réservations */}
                {reservations.length === 0 ? (
                    <Card className="p-12 text-center">
                        <div className="text-4xl mb-3">📭</div>
                        <p className="text-slate-600 font-medium">Aucune réservation</p>
                        <p className="text-sm text-slate-500 mt-1">
                            {search || statusFilter
                                ? "Essayez de modifier vos filtres"
                                : "Les réservations apparaîtront ici"}
                        </p>
                    </Card>
                ) : (
                    <div className="space-y-2">
                        {reservations.map((r) => (
                            <Card
                                key={r._id}
                                className="p-4 cursor-pointer transition hover:shadow-md hover:scale-[1.01]"
                                onClick={() => setSelected(r)}
                            >
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                    <div className="flex gap-3 flex-1 min-w-0">
                                        {/* Image de l'article */}
                                        {(r.creationId?.images?.[0] || r.creationId?.imageUrl) && (
                                            <img
                                                src={r.creationId.images?.[0] ?? r.creationId.imageUrl!}
                                                alt={r.creationId.title}
                                                className="h-16 w-16 rounded-lg object-cover shrink-0"
                                            />
                                        )}

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <div className="flex-1">
                                                    <p className="font-semibold text-slate-900">{r.name}</p>
                                                    <p className="text-xs text-slate-500">{r.contact}</p>
                                                </div>
                                                <Badge variant={getStatusBadgeVariant(r.status) as any}>
                                                    {getStatusLabel(r.status)}
                                                </Badge>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-2">
                                                <span className="flex items-center gap-1">
                                                    🕒 {new Date(r.createdAt).toLocaleDateString("fr-FR", {
                                                        day: "numeric",
                                                        month: "short",
                                                        hour: "2-digit",
                                                        minute: "2-digit"
                                                    })}
                                                </span>
                                                {r.creationId && (
                                                    <>
                                                        <span>•</span>
                                                        <span className="font-medium">{r.creationId.title}</span>
                                                        {r.creationId.price && (
                                                            <Badge variant="default" className="text-[10px]">
                                                                {r.creationId.price} €
                                                            </Badge>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex justify-center items-center gap-3 mt-6">
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => p - 1)}
                        >
                            ← Précédent
                        </Button>

                        <span className="text-sm text-slate-600 font-medium">
                            Page {page} / {totalPages}
                        </span>

                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => p + 1)}
                        >
                            Suivant →
                        </Button>
                    </div>
                )}
            </div>

            {/* Sidebar détails */}
            {selected && (
                <>
                    {/* Fond semi-transparent pour fermer au clic */}
                    <div 
                        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 animate-fadeIn"
                        onClick={() => setSelected(null)}
                    />
                    
                    <div className="fixed top-0 right-0 h-full w-full sm:w-[480px] bg-white shadow-2xl p-6 z-50 overflow-y-auto animate-slideInRight">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-slate-900">Détails de la réservation</h2>
                            <button
                                onClick={() => setSelected(null)}
                                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 text-slate-600"
                                aria-label="Fermer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Client info */}
                        <Card className="p-4 mb-4">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white text-lg font-semibold">
                                    {selected.name[0]?.toUpperCase()}
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-semibold text-slate-900">{selected.name}</h3>
                                    <p className="text-sm text-slate-600">{selected.contact}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span>🕒</span>
                                <span>{new Date(selected.createdAt).toLocaleString("fr-FR")}</span>
                            </div>
                        </Card>
                        {/* Message du client */}
                        {selected.message && (
                            <Card className="p-4 mb-4 bg-slate-50">
                                <p className="text-xs font-semibold text-slate-700 mb-2">💬 Message</p>
                                <p className="text-sm text-slate-900 whitespace-pre-line">
                                    {selected.message}
                                </p>
                            </Card>
                        )}

                        {/* Statut d'annulation */}
                        {selected.status === "cancelled" && (
                            <Card className="p-4 mb-4 bg-red-50 border-red-200">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-red-600">❌</span>
                                    <p className="text-xs font-semibold uppercase text-red-700">
                                        Annulée par {selected.cancelledBy === "user" ? "l'utilisateur" : "l'administrateur"}
                                    </p>
                                </div>
                                {(selected.cancelReason && selected.cancelReason.trim().length > 0) && (
                                    <div className="mt-3 pt-3 border-t border-red-200">
                                        <p className="text-xs font-semibold text-red-700 mb-1">Raison</p>
                                        <p className="text-sm text-red-900">
                                            {selected.cancelReason}
                                        </p>
                                    </div>
                                )}
                            </Card>
                        )}

                        {/* Article réservé */}
                        {selected.creationId && (
                            <Card className="p-4 mb-4">
                                <p className="text-xs font-semibold text-slate-700 mb-3">🎨 Article réservé</p>

                                <div className="flex gap-3 mb-3 p-3 rounded-lg border border-slate-200">
                                    {/* Image */}
                                    {(selected.creationId.images?.[0] || selected.creationId.imageUrl) && (
                                        <img
                                            src={selected.creationId.images?.[0] ?? selected.creationId.imageUrl!}
                                            alt={selected.creationId.title}
                                            className="h-24 w-24 rounded-lg object-cover shrink-0 ring-1 ring-slate-200"
                                        />
                                    )}

                                    {/* Titre + prix + couleur */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <p className="text-sm font-semibold text-slate-900">
                                                {selected.creationId.title}
                                            </p>
                                            {selected.creationId.price != null && (
                                                <Badge variant="default" className="bg-slate-900 text-white whitespace-nowrap">
                                                    {selected.creationId.price} €
                                                </Badge>
                                            )}
                                        </div>

                                        {selected.creationId.color && (
                                            <div className="flex items-center gap-1.5 mb-3">
                                                <span className="text-xs text-slate-500">Couleur:</span>
                                                <Badge variant="default">{selected.creationId.color}</Badge>
                                            </div>
                                        )}

                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setSelectedCreation(selected.creationId!);
                                                setShowCreationModal(true);
                                            }}
                                            className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-900 transition"
                                        >
                                            <svg
                                                className="h-4 w-4"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                                />
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                                />
                                            </svg>
                                            Voir en détail
                                        </button>
                                    </div>
                                </div>

                                {/* Description complète */}
                                {selected.creationId.description && (
                                    <div className="pt-3 border-t border-slate-200">
                                        <p className="text-xs text-slate-700 whitespace-pre-line">
                                            {selected.creationId.description}
                                        </p>
                                    </div>
                                )}
                            </Card>
                        )}

                        {/* Actions admin */}
                        <div className="space-y-3">
                            {selected.status === "pending" && (
                                <>
                                    <p className="text-xs font-semibold text-slate-700 mb-2">⚡ Actions</p>
                                    
                                    {!showValidateConfirm && !showCancelConfirm ? (
                                        <div className="flex gap-2">
                                            <Button
                                                onClick={() => setShowValidateConfirm(true)}
                                                className="flex-1 bg-green-600 hover:bg-green-700"
                                                size="md"
                                            >
                                                ✅ Valider
                                            </Button>

                                            <Button
                                                variant="danger"
                                                onClick={() => setShowCancelConfirm(true)}
                                                className="flex-1"
                                                size="md"
                                            >
                                                ❌ Annuler
                                            </Button>
                                        </div>
                                    ) : null}

                                    {/* Confirmation de validation */}
                                    {showValidateConfirm && (
                                        <Card className="p-4 bg-green-50 border-green-200">
                                            <p className="text-sm font-semibold text-green-900 mb-3">
                                                ✅ Confirmer la validation ?
                                            </p>
                                            <p className="text-xs text-green-700 mb-4">
                                                L'article sera marqué comme vendu et un email sera envoyé au client.
                                            </p>
                                            <div className="flex gap-2">
                                                <Button
                                                    onClick={() => {
                                                        updateStatus(selected._id, "validated");
                                                    }}
                                                    className="flex-1 bg-green-600 hover:bg-green-700"
                                                    size="sm"
                                                >
                                                    Confirmer
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    onClick={() => setShowValidateConfirm(false)}
                                                    className="flex-1"
                                                    size="sm"
                                                >
                                                    Annuler
                                                </Button>
                                            </div>
                                        </Card>
                                    )}

                                    {/* Confirmation d'annulation avec raison */}
                                    {showCancelConfirm && (
                                        <Card className="p-4 bg-red-50 border-red-200">
                                            <p className="text-sm font-semibold text-red-900 mb-3">
                                                ❌ Confirmer l'annulation ?
                                            </p>
                                            <p className="text-xs text-red-700 mb-3">
                                                La réservation sera annulée et l'article redeviendra disponible.
                                            </p>
                                            
                                            <textarea
                                                value={cancelReason}
                                                onChange={(e) => setCancelReason(e.target.value)}
                                                placeholder="Raison de l'annulation (optionnel)..."
                                                className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 mb-3"
                                                rows={3}
                                            />
                                            
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="danger"
                                                    onClick={() => {
                                                        updateStatus(selected._id, "cancelled");
                                                    }}
                                                    className="flex-1"
                                                    size="sm"
                                                >
                                                    Confirmer l'annulation
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    onClick={() => {
                                                        setShowCancelConfirm(false);
                                                        setCancelReason("");
                                                    }}
                                                    className="flex-1"
                                                    size="sm"
                                                >
                                                    Annuler
                                                </Button>
                                            </div>
                                        </Card>
                                    )}
                                </>
                            )}

                            {selected.status === "validated" && (
                                <div className="flex items-center justify-center py-3">
                                    <Badge variant="success" className="text-sm py-2 px-4">
                                        ✔️ Réservation validée
                                    </Badge>
                                </div>
                            )}

                            {selected.status === "cancelled" && (
                                <div className="flex items-center justify-center py-3">
                                    <Badge variant="danger" className="text-sm py-2 px-4">
                                        ✕ Réservation annulée
                                    </Badge>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Modale de visualisation de la création */}
            {showCreationModal && selectedCreation && (
                <CreationViewModal
                    creation={selectedCreation}
                    isOpen={showCreationModal}
                    onClose={() => {
                        setShowCreationModal(false);
                        setSelectedCreation(null);
                    }}
                />
            )}
        </main>
    );
}

function CreationViewModal({ creation, isOpen, onClose }: { creation: Creation; isOpen: boolean; onClose: () => void }) {
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
        }
    }, [isOpen]);

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

    if (!creation) return null;

    return (
        <div
            className={`fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 transition-opacity duration-150 ${
                isOpen ? "opacity-100" : "opacity-0"
            }`}
            onClick={onClose}
        >
            <div
                className={`relative w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-xl transform-gpu transition-all duration-150 max-h-[90vh] ${
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
                    <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-2">
                        {images.map((url, i) => (
                            <button
                                key={i}
                                onClick={() => setCurrentIndex(i)}
                                className={`h-14 w-14 shrink-0 rounded-md border-2 transition ${
                                    i === currentIndex ? "border-slate-900 ring-2 ring-slate-300" : "border-transparent opacity-60 hover:opacity-100"
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
                    <div className="text-xs text-slate-600">
                        💡 Cliquez sur l&apos;image pour zoomer
                    </div>
                    {creation.price != null && (
                        <Badge variant="default" className="text-sm font-semibold py-2 whitespace-nowrap px-4 bg-slate-900 text-white">
                            {creation.price} €
                        </Badge>
                    )}
                </div>
            </div>
        </div>
    );
}