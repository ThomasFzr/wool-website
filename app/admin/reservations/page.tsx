"use client";
import Link from "next/link";
import { Suspense, useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Badge, Card, Input } from "@/components";
import { CreationModal } from "@/components/CreationModal";
import type { Creation } from "@/components/CreationCard";

type Reservation = {
    _id: string;
    name: string;
    contact: string;
    message?: string;
    status: "pending" | "preparing" | "shipped" | "in_transit" | "delivered" | "validated" | "cancelled";
    createdAt: string;
    cancelReason?: string;
    cancelledBy?: "admin" | "user";
    deliveryMode?: "pickup" | "shipping";
    shippingCost?: number;
    trackingNumber?: string;
    shippedAt?: string;
    seenByAdmin?: boolean;
    stripeCheckoutSessionId?: string;
    paymentStatus?: "pending" | "paid" | "failed" | "refunded";
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

type GroupedOrder = {
    id: string;
    items: Reservation[];
    customerName: string;
    customerEmail: string;
    createdAt: string;
    status: string;
    deliveryMode?: string;
    totalPrice: number;
    seenByAdmin: boolean;
    paymentStatus?: "pending" | "paid" | "failed" | "refunded";
};

function AdminReservationsContent() {
    const searchParams = useSearchParams();
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [selected, setSelected] = useState<Reservation | null>(null);
    const [selectedOrderItems, setSelectedOrderItems] = useState<Reservation[]>([]);
    const [showValidateConfirm, setShowValidateConfirm] = useState(false);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [cancelReason, setCancelReason] = useState("");
    const [showCreationModal, setShowCreationModal] = useState(false);
    const [selectedCreation, setSelectedCreation] = useState<Creation | null>(null);
    const [trackingNumber, setTrackingNumber] = useState("");

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
        setSelectedOrderItems([]);
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

    async function updateStatus(id: string, status: string, tracking?: string) {
        const body: any = { status };
        if (status === "cancelled" && cancelReason.trim()) {
            body.cancelReason = cancelReason.trim();
        }
        if (tracking) {
            body.trackingNumber = tracking;
        }
        if (status === "shipped") {
            body.shippedAt = new Date().toISOString();
        }
        
        // Si on a des articles groupés (commande), mettre à jour tous les articles
        if (selectedOrderItems.length > 0) {
            await Promise.all(
                selectedOrderItems.map(item => 
                    fetch(`/api/admin/reservations/${item._id}`, {
                        method: "PATCH",
                        body: JSON.stringify({
                            ...body,
                            // Le tracking number seulement sur le premier article
                            trackingNumber: tracking && item === selectedOrderItems[0] ? tracking : item.trackingNumber,
                        }),
                        headers: { "Content-Type": "application/json" },
                    })
                )
            );
        } else {
            // Sinon, mettre à jour seulement la réservation sélectionnée
            await fetch(`/api/admin/reservations/${id}`, {
                method: "PATCH",
                body: JSON.stringify(body),
                headers: { "Content-Type": "application/json" },
            });
        }
        setTrackingNumber("");
        load();
    }

    async function deleteReservation(id: string) {
        // Si on a des articles groupés, supprimer toute la commande
        if (selectedOrderItems.length > 0) {
            // Supprimer tous les articles de la commande en parallèle
            await Promise.all(
                selectedOrderItems.map(item => 
                    fetch(`/api/admin/reservations/${item._id}`, { method: "DELETE" })
                )
            );
        } else {
            // Sinon, supprimer seulement l'article sélectionné
            await fetch(`/api/admin/reservations/${id}`, { method: "DELETE" });
        }
        load();
    }

    const getStatusBadgeVariant = (status: string) => {
        switch (status) {
            case "pending":
            case "preparing":
                return "warning";
            case "shipped":
            case "in_transit":
            case "delivered":
            case "validated":
                return "success";
            case "cancelled":
                return "danger";
            default:
                return "warning";
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case "pending":
            case "preparing":
                return "En préparation";
            case "shipped":
                return "Expédiée";
            case "in_transit":
                return "En cours de livraison";
            case "delivered":
                return "Livrée";
            case "validated":
                return "Paiement validé";
            case "cancelled":
                return "Annulée";
            default:
                return "En cours";
        }
    };

    const getDeliveryLabel = (mode?: string) => {
        if (mode === "shipping") return "🚚 Livraison";
        return "🤝 Remise en main propre";
    };

    // Regrouper les réservations par commande (stripeCheckoutSessionId)
    const groupedOrders = useMemo(() => {
        const grouped = new Map<string, Reservation[]>();
        
        reservations.forEach((res) => {
            // Utiliser stripeCheckoutSessionId comme clé, ou l'ID de la réservation si pas de session
            const key = res.stripeCheckoutSessionId || res._id;
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key)!.push(res);
        });

        // Convertir en tableau de commandes groupées
        const orders: GroupedOrder[] = [];
        grouped.forEach((items, id) => {
            const firstItem = items[0];
            const subtotal = items.reduce((sum, item) => sum + ((item.creationId as any)?.price || 0), 0);
            const shippingCost = items.reduce((sum, item) => sum + (item.shippingCost || 0), 0);
            const totalPrice = subtotal + shippingCost;
            
            // Déterminer le statut global (prendre le plus avancé)
            // Note: pending et preparing sont traités de la même manière
            const statusPriority: Record<string, number> = {
                cancelled: 0,
                pending: 2, // Traité comme preparing
                preparing: 2,
                shipped: 3,
                in_transit: 4,
                delivered: 5,
                validated: 6,
            };
            
            const sortedByStatus = [...items].sort((a, b) => 
                (statusPriority[b.status] || 0) - (statusPriority[a.status] || 0)
            );
            const highestStatus = sortedByStatus[0].status;
            
            // Vérifier si la commande a été vue
            const seenByAdmin = items.some(i => i.seenByAdmin);
            
            // Déterminer le statut de paiement (prendre "paid" si au moins un item est payé)
            const paymentStatus = items.some(i => i.paymentStatus === "paid") 
                ? "paid" 
                : (items[0]?.paymentStatus || "pending");

            orders.push({
                id,
                items,
                customerName: firstItem.name,
                customerEmail: firstItem.contact,
                createdAt: (firstItem as any).paidAt || firstItem.createdAt,
                status: highestStatus,
                deliveryMode: firstItem.deliveryMode,
                totalPrice,
                seenByAdmin,
                paymentStatus,
            });
        });

        // Trier par date décroissante
        return orders.sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }, [reservations]);

    const pendingCount = groupedOrders.filter(o => o.status === "pending" || o.status === "preparing").length;
    const totalCount = groupedOrders.length;

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
                        <Link
                            href="/admin/reservations/create"
                            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition"
                        >
                            <span>+</span>
                            <span>Créer une commande</span>
                        </Link>
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
                            <option value="preparing">📦 En préparation</option>
                            <option value="shipped">📮 Expédiées</option>
                            <option value="in_transit">🚚 En cours de livraison</option>
                            <option value="delivered">✅ Livrées</option>
                            <option value="validated">✔️ Confirmées</option>
                            <option value="cancelled">❌ Annulées</option>
                        </select>
                    </div>
                </Card>

                {/* Liste des commandes */}
                {groupedOrders.length === 0 ? (
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
                    <div className="space-y-3">
                        {groupedOrders.map((order) => (
                            <Card
                                key={order.id}
                                className={`p-4 cursor-pointer transition hover:shadow-md hover:scale-[1.01] ${!order.seenByAdmin ? 'ring-2 ring-blue-500 bg-blue-50/50' : ''}`}
                                onClick={() => {
                                    // Sélectionner le premier article de la commande pour afficher les détails
                                    // Chercher l'article avec l'adresse de livraison si disponible
                                    const itemWithAddress = order.items.find(item => item.shippingAddress) || order.items[0];
                                    setSelected(itemWithAddress);
                                    setSelectedOrderItems(order.items);
                                    // Marquer tous les articles comme vus
                                    if (!order.seenByAdmin) {
                                        order.items.forEach(item => {
                                            fetch(`/api/admin/reservations/${item._id}`, {
                                                method: "PATCH",
                                                body: JSON.stringify({ seenByAdmin: true }),
                                                headers: { "Content-Type": "application/json" },
                                            });
                                        });
                                    }
                                }}
                            >
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                    <div className="flex gap-3 flex-1 min-w-0">
                                        {/* Images des articles (première image de chaque article) */}
                                        <div className="flex gap-1 shrink-0">
                                            {order.items.slice(0, 3).map((item, idx) => {
                                                const creation = item.creationId;
                                                const image = creation?.images?.[0] || creation?.imageUrl;
                                                return image ? (
                                                    <img
                                                        key={idx}
                                                        src={image}
                                                        alt={creation?.title || "Article"}
                                                        className="h-16 w-16 rounded-lg object-cover border border-slate-200"
                                                    />
                                                ) : null;
                                            })}
                                            {order.items.length > 3 && (
                                                <div className="h-16 w-16 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600">
                                                    +{order.items.length - 3}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-semibold text-slate-900 truncate">{order.customerName}</p>
                                                        {order.paymentStatus === "paid" && (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-500 text-white">
                                                                Paiement validé
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-slate-500 truncate">{order.customerEmail}</p>
                                                </div>
                                                <Badge variant={getStatusBadgeVariant(order.status) as any} className="shrink-0">
                                                    {getStatusLabel(order.status)}
                                                </Badge>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-2">
                                                <span className="flex items-center gap-1">
                                                    🕒 {new Date(order.createdAt).toLocaleDateString("fr-FR", {
                                                        day: "numeric",
                                                        month: "short",
                                                        hour: "2-digit",
                                                        minute: "2-digit"
                                                    })}
                                                </span>
                                                <span>•</span>
                                                <span className="font-medium">{order.items.length} article{order.items.length > 1 ? "s" : ""}</span>
                                                <span>•</span>
                                                <span className="font-semibold text-slate-900">{order.totalPrice} €</span>
                                                {order.deliveryMode && (
                                                    <>
                                                        <span>•</span>
                                                        <span>{getDeliveryLabel(order.deliveryMode)}</span>
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
                        onClick={() => {
                                    setSelected(null);
                                    setSelectedOrderItems([]);
                                }}
                    />
                    
                    <div className="fixed top-0 right-0 h-full w-full sm:w-[480px] bg-white shadow-2xl p-6 z-50 overflow-y-auto animate-slideInRight">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-slate-900">Détails de la commande</h2>
                            <button
                                onClick={() => {
                                    setSelected(null);
                                    setSelectedOrderItems([]);
                                }}
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
                                            
                                            {/* Bouton télécharger bordereau - toujours visible pour shipping */}
                                            {selected.deliveryMode === "shipping" && (
                                                <Button
                                                    onClick={() => {
                                                        window.open(`/api/admin/reservations/${selected._id}/shipping-label`, '_blank');
                                                    }}
                                                    variant="secondary"
                                                    className="w-full mt-3 cursor-pointer"
                                                    size="md"
                                                >
                                                    📄 Télécharger bordereau d&apos;envoi
                                                </Button>
                                            )}
                                            
                                            {/* Adresse de livraison - chercher dans tous les articles de la commande */}
                                            {selected.deliveryMode === "shipping" && (() => {
                                                const addr = selected.shippingAddress || 
                                                             selectedOrderItems.find(item => item.shippingAddress)?.shippingAddress;
                                                return addr ? (
                                                <div className="mt-3 pt-3 border-t border-slate-200">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <p className="text-xs font-semibold text-slate-700">📍 Adresse de livraison</p>
                                                        <button
                                                            onClick={() => {
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
                                                        <p className="font-medium">{addr.name}</p>
                                                        <p>{addr.line1}</p>
                                                        {addr.line2 && (
                                                            <p>{addr.line2}</p>
                                                        )}
                                                        <p>{addr.postalCode} {addr.city}</p>
                                                        <p className="text-slate-600">{addr.country}</p>
                                                    </div>
                                                    
                                                </div>
                                                ) : null;
                                            })()}
                                            
                                            {/* Message si pas d'adresse mais mode shipping */}
                                            {selected.deliveryMode === "shipping" && !selected.shippingAddress && !selectedOrderItems.find(item => item.shippingAddress) && (
                                                <div className="mt-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                                                    <p className="text-xs text-yellow-800">
                                                        ⚠️ Adresse de livraison non disponible. Le bordereau sera généré sans adresse complète.
                                                    </p>
                                                </div>
                                            )}
                                            
                                            {/* Frais de livraison - calculer le total de tous les articles de la commande */}
                                            {selectedOrderItems.length > 0 ? (
                                                (() => {
                                                    const totalShipping = selectedOrderItems.reduce((sum, item) => sum + (item.shippingCost || 0), 0);
                                                    return totalShipping > 0 ? (
                                                        <p className="mt-2 text-xs text-slate-600">
                                                            Frais de livraison : <span className="font-semibold">{totalShipping} €</span>
                                                        </p>
                                                    ) : null;
                                                })()
                                            ) : selected.shippingCost != null && selected.shippingCost > 0 ? (
                                                <p className="mt-2 text-xs text-slate-600">
                                                    Frais de livraison : <span className="font-semibold">{selected.shippingCost} €</span>
                                                </p>
                                            ) : null}
                                        </Card>

                                        {/* Articles de la commande */}
                                        {selectedOrderItems.length > 0 ? (
                                            <Card className="p-4 mb-4">
                                                <p className="text-xs font-semibold text-slate-700 mb-3">
                                                    🎨 Articles de la commande ({selectedOrderItems.length})
                                                </p>
                                                <div className="space-y-3">
                                                    {selectedOrderItems.map((item) => {
                                                        const creation = item.creationId;
                                                        if (!creation) return null;
                                                        
                                                        return (
                                                            <div 
                                                                key={item._id} 
                                                                className="flex gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors"
                                                                onClick={async () => {
                                                                    try {
                                                                        const res = await fetch(`/api/creations/${creation._id}`);
                                                                        if (res.ok) {
                                                                            const fullCreation = await res.json();
                                                                            setSelectedCreation(fullCreation);
                                                                            setShowCreationModal(true);
                                                                        }
                                                                    } catch (err) {
                                                                        console.error("Erreur lors du chargement de l'article:", err);
                                                                    }
                                                                }}
                                                            >
                                                                {(creation.images?.[0] || creation.imageUrl) && (
                                                                    <img
                                                                        src={creation.images?.[0] ?? creation.imageUrl!}
                                                                        alt={creation.title}
                                                                        className="h-24 w-24 rounded-lg object-cover shrink-0 ring-1 ring-slate-200"
                                                                    />
                                                                )}
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-start justify-between gap-2 mb-2">
                                                                        <p className="text-sm font-semibold text-slate-900">
                                                                            {creation.title}
                                                                        </p>
                                                                        {creation.price != null && (
                                                                            <Badge variant="default" className="bg-slate-900 text-white whitespace-nowrap">
                                                                                {creation.price} €
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                    {creation.color && (
                                                                        <div className="flex items-center gap-1.5 mb-2">
                                                                            <span className="text-xs text-slate-500">Couleur:</span>
                                                                            <Badge variant="default">{creation.color}</Badge>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </Card>
                                        ) : selected.creationId && (
                                            <Card className="p-4 mb-4">
                                                <p className="text-xs font-semibold text-slate-700 mb-3">🎨 Article commandé</p>

                                <div 
                                    className="flex gap-3 mb-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors"
                                    onClick={async () => {
                                        if (!selected.creationId) return;
                                        try {
                                            const res = await fetch(`/api/creations/${selected.creationId._id}`);
                                            if (res.ok) {
                                                const fullCreation = await res.json();
                                                setSelectedCreation(fullCreation);
                                                setShowCreationModal(true);
                                            }
                                        } catch (err) {
                                            console.error("Erreur lors du chargement de l'article:", err);
                                        }
                                    }}
                                >
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
                                                e.stopPropagation();
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
                            <p className="text-xs font-semibold text-slate-700 mb-2">⚡ Actions</p>
                            
                            {/* Gestion des statuts */}
                            {(selected.status === "pending" || selected.status === "preparing") && (
                                <>
                                    {!showValidateConfirm && !showCancelConfirm ? (
                                        <div className="flex flex-col gap-2">
                                            {/* Si remise en main propre : Livré */}
                                            {selected.deliveryMode === "pickup" && (
                                                <Button
                                                    onClick={() => updateStatus(selected._id, "delivered")}
                                                    className="w-full bg-green-600 hover:bg-green-700 cursor-pointer"
                                                    size="md"
                                                >
                                                    ✅ Livré
                                                </Button>
                                            )}
                                            
                                            {/* Si livraison : Marquer comme expédié */}
                                            {selected.deliveryMode === "shipping" && (
                                                <Button
                                                    onClick={() => {
                                                        const tracking = prompt("Numéro de suivi (optionnel) :");
                                                        updateStatus(selected._id, "shipped", tracking || undefined);
                                                    }}
                                                    className="w-full bg-purple-600 hover:bg-purple-700 cursor-pointer"
                                                    size="md"
                                                >
                                                    📦 Marquer comme expédiée
                                                </Button>
                                            )}
                                            
                                            {/* Bouton Annuler toujours disponible */}
                                            <Button
                                                variant="danger"
                                                onClick={() => setShowCancelConfirm(true)}
                                                className="w-full cursor-pointer"
                                                size="md"
                                            >
                                                ❌ Annuler
                                            </Button>
                                        </div>
                                    ) : null}

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

                            {selected.status === "shipped" && (
                                <div className="space-y-2">
                                    {selected.trackingNumber && (
                                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                            <p className="text-xs font-semibold text-blue-900 mb-1">🔢 Numéro de suivi</p>
                                            <p className="text-sm font-mono text-blue-700">{selected.trackingNumber}</p>
                                        </div>
                                    )}
                                    <Button
                                        onClick={() => updateStatus(selected._id, "in_transit")}
                                        className="w-full bg-orange-600 hover:bg-orange-700 cursor-pointer"
                                        size="md"
                                    >
                                        🚚 Marquer en cours de livraison
                                    </Button>
                                </div>
                            )}

                            {selected.status === "in_transit" && (
                                <div className="space-y-2">
                                    {selected.trackingNumber && (
                                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                            <p className="text-xs font-semibold text-blue-900 mb-1">🔢 Numéro de suivi</p>
                                            <p className="text-sm font-mono text-blue-700">{selected.trackingNumber}</p>
                                        </div>
                                    )}
                                    <Button
                                        onClick={() => updateStatus(selected._id, "delivered")}
                                        className="w-full bg-green-600 hover:bg-green-700 cursor-pointer"
                                        size="md"
                                    >
                                        ✅ Marquer comme livrée
                                    </Button>
                                    <Button
                                        onClick={() => updateStatus(selected._id, "shipped")}
                                        variant="secondary"
                                        className="w-full cursor-pointer"
                                        size="md"
                                    >
                                        ← Retour expédiée
                                    </Button>
                                </div>
                            )}

                            {selected.status === "delivered" && (
                                <div className="flex items-center justify-center py-3">
                                    <Badge variant="success" className="text-sm py-2 px-4">
                                        ✅ Commande livrée
                                    </Badge>
                                </div>
                            )}

                            {selected.status === "validated" && selected.paymentStatus === "paid" && (
                                <div className="space-y-2">
                                    <Badge variant="success" className="text-sm py-2 px-4 w-full justify-center">
                                        ✔️ Paiement validé
                                    </Badge>
                                    {selected.deliveryMode === "shipping" ? (
                                        <Button
                                            onClick={() => {
                                                const tracking = prompt("Numéro de suivi (optionnel) :");
                                                updateStatus(selected._id, "shipped", tracking || undefined);
                                            }}
                                            className="w-full bg-purple-600 hover:bg-purple-700 cursor-pointer"
                                            size="md"
                                        >
                                            📦 Expédié
                                        </Button>
                                    ) : (
                                        <Button
                                            onClick={() => updateStatus(selected._id, "delivered")}
                                            className="w-full bg-green-600 hover:bg-green-700 cursor-pointer"
                                            size="md"
                                        >
                                            ✅ Terminé
                                        </Button>
                                    )}
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
                                                            Cette action est <strong>irréversible</strong>. 
                                                            {selectedOrderItems.length > 1 ? (
                                                                <> Toute la commande ({selectedOrderItems.length} article{selectedOrderItems.length > 1 ? 's' : ''}) sera supprimée de la base de données et les articles redeviendront disponibles.</>
                                                            ) : (
                                                                <> La commande sera supprimée de la base de données et l'article redeviendra disponible.</>
                                                            )}
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