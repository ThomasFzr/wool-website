"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Badge, Card, Input } from "@/components";
import { CreationModal } from "@/components/CreationModal";
import type { Creation } from "@/components/CreationCard";

type Reservation = {
    _id: string;
    name: string;
    contact: string;
    message?: string;
    status: "pending" | "validated" | "cancelled";
    createdAt: string;
    cancelReason?: string;
    cancelledBy?: "admin" | "user";
    deliveryMode?: "pickup" | "shipping";
    shippingCost?: number;
    seenByAdmin?: boolean;
    shippingAddress?: {
        name: string;
        line1: string;
        line2?: string;
        city: string;
        postalCode: string;
        country: string;
    };
    creationId?: Creation | null;
};

function AdminReservationsContent() {
    const searchParams = useSearchParams();
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [selected, setSelected] = useState<Reservation | null>(null);
    const [showValidateConfirm, setShowValidateConfirm] = useState(false);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
        setShowDeleteConfirm(false);
        setCancelReason("");
    }

    useEffect(() => {
        load();
    }, [page, search, statusFilter]);

    // Ouvrir automatiquement la sidebar de réservation si creationId est dans l'URL
    useEffect(() => {
        const creationId = searchParams.get('creationId');
        if (creationId && reservations.length > 0) {
            // Trouver la réservation avec cette création
            const reservation = reservations.find((r) => r.creationId?._id === creationId);
            if (reservation) {
                setSelected(reservation);
                // Nettoyer l'URL après ouverture
                window.history.replaceState({}, '', '/admin/reservations');
            }
        }
    }, [searchParams, reservations]);

    // Désactiver le scroll quand la sidebar est ouverte
    useEffect(() => {
        if (selected) {
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
    }, [selected]);

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
        if (status === "pending") return "En cours de préparation";
        if (status === "validated") return "Confirmée";
        return "Annulée";
    };

    const getDeliveryLabel = (mode?: string) => {
        if (mode === "shipping") return "🚚 Livraison";
        return "🤝 Remise en main propre";
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
                                📋 Commandes
                            </h1>
                            <p className="text-sm text-slate-600 mt-1">
                                {totalCount} commande{totalCount > 1 ? "s" : ""} au total
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

                {/* Liste des commandes */}
                {reservations.length === 0 ? (
                    <Card className="p-12 text-center">
                        <div className="text-4xl mb-3">📭</div>
                        <p className="text-slate-600 font-medium">Aucune commande</p>
                        <p className="text-sm text-slate-500 mt-1">
                            {search || statusFilter
                                ? "Essayez de modifier vos filtres"
                                : "Les commandes apparaîtront ici"}
                        </p>
                    </Card>
                ) : (
                    <div className="space-y-2">
                        {reservations.map((r) => (
                            <Card
                                key={r._id}
                                className={`p-4 cursor-pointer transition hover:shadow-md hover:scale-[1.01] ${!r.seenByAdmin ? 'ring-2 ring-blue-500 bg-blue-50/50' : ''}`}
                                onClick={() => {
                                    setSelected(r);
                                    // Marquer comme vue
                                    if (!r.seenByAdmin) {
                                        fetch(`/api/admin/reservations/${r._id}`, {
                                            method: "PATCH",
                                            body: JSON.stringify({ seenByAdmin: true }),
                                            headers: { "Content-Type": "application/json" },
                                        });
                                    }
                                }}
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
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-semibold text-slate-900 truncate">{r.name}</p>
                                                        {!r.seenByAdmin && (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500 text-white animate-pulse">
                                                                NOUVELLE
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-slate-500 truncate">{r.contact}</p>
                                                </div>
                                                <Badge variant={getStatusBadgeVariant(r.status) as any} className="shrink-0">
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
                            className="cursor-pointer"
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
                            className="cursor-pointer"
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
                            <h2 className="text-xl font-bold text-slate-900">Détails de la commande</h2>
                            <button
                                onClick={() => setSelected(null)}
                                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 text-slate-600 cursor-pointer"
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
                                                        Commande annulée par {selected.cancelledBy === "user" ? "le client" : "l'administrateur"}
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

{/* Mode de livraison et adresse */}
                                        <Card className="p-4 mb-4 bg-slate-50">
                                            <p className="text-xs font-semibold text-slate-700 mb-2">📦 Mode de livraison</p>
                                            <p className="text-sm font-medium text-slate-900 mb-2">
                                                {getDeliveryLabel(selected.deliveryMode)}
                                            </p>
                                            
                                            {/* Adresse de livraison */}
                                            {selected.deliveryMode === "shipping" && selected.shippingAddress && (
                                                <div className="mt-3 pt-3 border-t border-slate-200">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <p className="text-xs font-semibold text-slate-700">📍 Adresse de livraison</p>
                                                        <button
                                                            onClick={() => {
                                                                const addr = selected.shippingAddress!;
                                                                const text = `${addr.name}\n${addr.line1}${addr.line2 ? '\n' + addr.line2 : ''}\n${addr.postalCode} ${addr.city}\n${addr.country}`;
                                                                navigator.clipboard.writeText(text);
                                                                alert('Adresse copiée !');
                                                            }}
                                                            className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer flex items-center gap-1"
                                                        >
                                                            📋 Copier
                                                        </button>
                                                    </div>
                                                    <div className="text-sm text-slate-900 bg-white rounded-lg p-3 border border-slate-200">
                                                        <p className="font-medium">{selected.shippingAddress.name}</p>
                                                        <p>{selected.shippingAddress.line1}</p>
                                                        {selected.shippingAddress.line2 && (
                                                            <p>{selected.shippingAddress.line2}</p>
                                                        )}
                                                        <p>{selected.shippingAddress.postalCode} {selected.shippingAddress.city}</p>
                                                        <p className="text-slate-600">{selected.shippingAddress.country}</p>
                                                    </div>
                                                    
                                                    {/* Bouton pour copier le bordereau */}
                                                    <button
                                                        onClick={() => {
                                                            const addr = selected.shippingAddress!;
                                                            const creation = selected.creationId;
                                                            const bordereau = `EXPÉDITEUR:\nMailleMum\n[Votre adresse]\n\nDESTINATAIRE:\n${addr.name}\n${addr.line1}${addr.line2 ? '\n' + addr.line2 : ''}\n${addr.postalCode} ${addr.city}\n${addr.country}\n\nCONTENU:\n${creation?.title || 'Article'}\nPrix: ${creation?.price || 0}€`;
                                                            navigator.clipboard.writeText(bordereau);
                                                            alert('Infos bordereau copiées !');
                                                        }}
                                                        className="mt-3 w-full py-2 px-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer flex items-center justify-center gap-2"
                                                    >
                                                        🏷️ Copier pour bordereau d&apos;envoi
                                                    </button>
                                                </div>
                                            )}
                                            
                                            {/* Frais de livraison */}
                                            {selected.shippingCost != null && selected.shippingCost > 0 && (
                                                <p className="mt-2 text-xs text-slate-600">
                                                    Frais de livraison : <span className="font-semibold">{selected.shippingCost} €</span>
                                                </p>
                                            )}
                                        </Card>

                                        {/* Article commandé */}
                                        {selected.creationId && (
                                            <Card className="p-4 mb-4">
                                                <p className="text-xs font-semibold text-slate-700 mb-3">🎨 Article commandé</p>

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
                                            className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-900 transition cursor-pointer"
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
                                                className="flex-1 bg-green-600 hover:bg-green-700 cursor-pointer"
                                                size="md"
                                            >
                                                ✅ Valider
                                            </Button>

                                            <Button
                                                variant="danger"
                                                onClick={() => setShowCancelConfirm(true)}
                                                className="flex-1 cursor-pointer"
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
                                                                ✅ Confirmer la commande ?
                                                            </p>
                                                            <p className="text-xs text-green-700 mb-4">
                                                                L'article sera marqué comme vendu et un email sera envoyé au client.
                                                            </p>
                                                            <div className="flex gap-2">
                                                                <Button
                                                                    onClick={() => {
                                                                        updateStatus(selected._id, "validated");
                                                                    }}
                                                                    className="flex-1 bg-green-600 hover:bg-green-700 cursor-pointer"
                                                                    size="sm"
                                                                >
                                                                    Confirmer
                                                                </Button>
                                                                <Button
                                                                    variant="secondary"
                                                                    onClick={() => setShowValidateConfirm(false)}
                                                                    className="flex-1 cursor-pointer"
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
                                                                ❌ Annuler la commande ?
                                                            </p>
                                                            <p className="text-xs text-red-700 mb-3">
                                                                La commande sera annulée et l'article redeviendra disponible.
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
                                                                    className="flex-1 cursor-pointer"
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
                                                                    className="flex-1 cursor-pointer"
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
                                                        ✔️ Commande confirmée
                                                    </Badge>
                                                </div>
                                            )}

                                            {selected.status === "cancelled" && (
                                                <div className="flex items-center justify-center py-3">
                                                    <Badge variant="danger" className="text-sm py-2 px-4">
                                                        ✕ Commande annulée
                                                    </Badge>
                                                </div>
                                            )}

                                            {/* Bouton de suppression définitive */}
                                            <div className="pt-4 mt-4 border-t border-slate-200">
                                                {!showDeleteConfirm ? (
                                                    <Button
                                                        variant="danger"
                                                        onClick={() => setShowDeleteConfirm(true)}
                                                        className="w-full bg-red-600 hover:bg-red-700 cursor-pointer"
                                                        size="sm"
                                                    >
                                                        🗑️ Supprimer définitivement
                                                    </Button>
                                                ) : (
                                                    <Card className="p-4 bg-red-50 border-red-200">
                                                        <p className="text-sm font-semibold text-red-900 mb-2">
                                                            ⚠️ Confirmer la suppression ?
                                                        </p>
                                                        <p className="text-xs text-red-700 mb-4">
                                                            Cette action est <strong>irréversible</strong>. La commande sera supprimée de la base de données et l'article redeviendra disponible.
                                                        </p>
                                                        <div className="flex gap-2">
                                                            <Button
                                                                variant="danger"
                                                                onClick={() => deleteReservation(selected._id)}
                                                                className="flex-1 cursor-pointer"
                                                                size="sm"
                                                            >
                                                                Supprimer
                                                            </Button>
                                                            <Button
                                                                variant="secondary"
                                                                onClick={() => setShowDeleteConfirm(false)}
                                                                className="flex-1 cursor-pointer"
                                                                size="sm"
                                                            >
                                                                Annuler
                                                            </Button>
                                                        </div>
                                                    </Card>
                                                )}
                                            </div>
                                        </div>
                    </div>
                </>
            )}

            {/* Modale de visualisation de la création */}
            <CreationModal
                creation={selectedCreation}
                isOpen={showCreationModal}
                onClose={() => {
                    setShowCreationModal(false);
                    setSelectedCreation(null);
                }}
                hideActions={true}
            />
        </main>
    );
}

export default function AdminReservations() {
    return (
        <Suspense fallback={
            <main className="min-h-screen bg-slate-50">
                <div className="mx-auto max-w-6xl px-4 py-6">
                    <div className="text-center py-12">
                        <p className="text-slate-600">Chargement...</p>
                    </div>
                </div>
            </main>
        }>
            <AdminReservationsContent />
        </Suspense>
    );
}