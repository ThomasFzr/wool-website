"use client";
import Link from "next/link";

import { useEffect, useState } from "react";

type Reservation = {
    _id: string;
    name: string;
    contact: string;
    message?: string;
    status: "pending" | "validated" | "cancelled";
    createdAt: string;
    cancelReason?: string;
    creationId?: {
        _id: string;
        title: string;
        images?: string[];
        imageUrl?: string;
        price?: number;
        color?: string;
        description?: string;
    } | null;
};

export default function AdminReservations() {
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [selected, setSelected] = useState<Reservation | null>(null);

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
    }

    useEffect(() => {
        load();
    }, [page, search, statusFilter]);

    async function updateStatus(id: string, status: string) {
        await fetch(`/api/admin/reservations/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
            headers: { "Content-Type": "application/json" },
        });
        load();
    }

    async function deleteReservation(id: string) {
        await fetch(`/api/admin/reservations/${id}`, { method: "DELETE" });
        load();
    }

    return (
        <main className="p-8 max-w-4xl mx-auto">
            <div className="mb-4 flex items-center justify-between">
                <Link
                    href="/admin"
                    className="text-sm text-slate-600 hover:text-slate-900"
                >
                    ← Retour
                </Link>
            </div>
            <h1 className="text-2xl font-bold mb-6">Réservations</h1>

            {/* Filtres */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
                <input
                    placeholder="Rechercher…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="rounded-lg border px-3 py-2 text-sm"
                />

                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-lg border px-3 py-2 text-sm"
                >
                    <option value="">Tous les statuts</option>
                    <option value="pending">En attente</option>
                    <option value="validated">Validée</option>
                    <option value="cancelled">Annulée</option>
                </select>
            </div>

            {/* Liste */}
            <div className="space-y-3">
                {reservations.map((r) => (
                    <div
                        key={r._id}
                        className="border rounded-xl bg-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between cursor-pointer hover:bg-slate-50"
                        onClick={() => setSelected(r)}
                    >
                        <div>
                            <p className="font-semibold">{r.name}</p>
                            <p className="text-xs text-slate-500">{r.contact}</p>
                            <p className="text-xs text-slate-400 mt-1">
                                {new Date(r.createdAt).toLocaleString("fr-FR")}
                            </p>
                            {r.creationId && (
                                <p className="mt-1 text-xs text-slate-600">
                                    Article : <span className="font-medium">{r.creationId.title}</span>
                                </p>
                            )}
                        </div>

                        <span
                            className={`mt-2 sm:mt-0 text-xs font-semibold px-2 py-1 rounded-full ${r.status === "pending"
                                ? "bg-yellow-100 text-yellow-800"
                                : r.status === "validated"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-red-100 text-red-700"
                                }`}
                        >
                            {r.status === "pending" ? "En attente" : r.status === "validated" ? "Validée" : "Annulée"}
                        </span>
                    </div>
                ))}
            </div>

            {/* Pagination */}
            <div className="flex justify-center gap-3 mt-8">
                <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-3 py-2 bg-slate-100 rounded disabled:opacity-30"
                >
                    ← Précédent
                </button>

                <span className="text-sm text-slate-600">
                    Page {page} / {totalPages}
                </span>

                <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-2 bg-slate-100 rounded disabled:opacity-30"
                >
                    Suivant →
                </button>
            </div>

            {/* Sidebar détails */}
            {selected && (
                <>
                    {/* Fond semi-transparent pour fermer au clic */}
                    <div 
                        className="fixed inset-0 bg-black/20 z-40"
                        onClick={() => setSelected(null)}
                    />
                    
                    <div className="fixed top-0 right-0 h-full w-96 bg-white shadow-2xl p-6 border-l z-50 overflow-y-auto">
                        <button
                            className="mb-4 text-sm text-slate-600 hover:underline"
                            onClick={() => setSelected(null)}
                        >
                            ← Retour
                        </button>

                    <h2 className="text-lg font-bold mb-2">{selected.name}</h2>
                    <p className="text-sm text-slate-600">{selected.contact}</p>
                    {selected.message && (
                        <p className="mt-3 text-sm whitespace-pre-line">
                            {selected.message}
                        </p>
                    )}
                    {selected.status === "cancelled" && (
                        <div className="mt-4 rounded-lg bg-red-50 p-3">
                            <p className="text-xs font-semibold uppercase text-red-700">
                                Raison de l&apos;annulation
                            </p>
                            <p className="mt-1 text-sm text-red-800">
                                {selected.cancelReason && selected.cancelReason.trim().length > 0
                                    ? selected.cancelReason
                                    : "Aucune raison précisée."}
                            </p>
                        </div>
                    )}

                    {/* ARTICLE COMPLET */}
                    {selected.creationId && (
                        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                            <p className="text-xs uppercase font-semibold text-slate-500">
                                Article
                            </p>

                            <div className="flex gap-3">
                                {/* Image */}
                                {(selected.creationId.images?.[0] || selected.creationId.imageUrl) && (
                                    <img
                                        src={selected.creationId.images?.[0] ?? selected.creationId.imageUrl!}
                                        alt={selected.creationId.title}
                                        className="h-20 w-20 rounded-md object-cover shrink-0"
                                    />
                                )}

                                {/* Titre + prix + couleur */}
                                <div className="flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-medium">
                                            {selected.creationId.title}
                                        </p>
                                        {selected.creationId.price != null && (
                                            <span className="inline-flex items-center rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-800 whitespace-nowrap">
                                                {selected.creationId.price}&nbsp;€
                                            </span>
                                        )}
                                    </div>

                                    {selected.creationId.color && (
                                        <p className="mt-1 text-xs text-slate-600">
                                            Couleur : {selected.creationId.color}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Description complète */}
                            {selected.creationId.description && (
                                <p className="text-xs text-slate-700 whitespace-pre-line">
                                    {selected.creationId.description}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Boutons actions admin */}
                    {selected.status === "pending" && (
                        <div className="mt-6 flex gap-2">
                            <button
                                onClick={() => updateStatus(selected._id, "validated")}
                                className="px-3 py-2 bg-green-600 text-white rounded"
                            >
                                Valider
                            </button>

                            <button
                                onClick={() => deleteReservation(selected._id)}
                                className="px-3 py-2 bg-red-600 text-white rounded"
                            >
                                Annuler
                            </button>
                        </div>
                    )}

                    {selected.status === "validated" && (
                        <div className="mt-6">
                            <span className="text-xs font-semibold px-3 py-2 bg-green-100 text-green-700 rounded-full">
                                ✔️ Validée
                            </span>
                        </div>
                    )}

                    {selected.status === "cancelled" && (
                        <div className="mt-6">
                            <span className="text-xs font-semibold px-3 py-2 bg-red-100 text-red-700 rounded-full">
                                ✕ Annulée
                            </span>
                        </div>
                    )}
                </div>
                </>
            )}
        </main>
    );
}