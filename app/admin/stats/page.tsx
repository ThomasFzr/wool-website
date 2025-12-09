"use client";

import Link from "next/link";
import { useState, useEffect, Suspense, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { StatsCard, StatsChart } from "@/components";

// Composant de chargement réutilisable
const LoadingScreen = () => (
  <main className="min-h-screen flex items-center justify-center bg-slate-50">
    <div className="text-slate-600">Chargement...</div>
  </main>
);

function StatsContent() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const hasLoadedStats = useRef(false);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated" || session?.user?.role !== "admin") {
      router.push("/");
    }
  }, [session, status, router]);

  useEffect(() => {
    if (session?.user?.role === "admin" && !hasLoadedStats.current) {
      loadStats();
    }
  }, [session]);

  async function loadStats() {
    try {
      setLoadingStats(true);
      const res = await fetch("/api/admin/stats");
      if (!res.ok) return;
      const data = await res.json();
      setStats(data);
      hasLoadedStats.current = true;
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStats(false);
    }
  }

  // Fonction helper pour calculer les pourcentages
  const calcPercent = (value: number, total: number) => 
    total > 0 ? ((value / total) * 100).toFixed(0) : '0';

  // Fonction helper pour le pluriel
  const plural = (count: number, singular: string = '') => 
    count > 1 ? 's' : singular;

  if (status === "loading") return <LoadingScreen />;
  if (!session || session.user.role !== "admin") return null;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-2"
          >
            ← Retour à l&apos;administration
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            📊 Statistiques
          </h1>
          <p className="text-slate-600 mt-2">
            Vue d&apos;ensemble de vos ventes et réservations
          </p>
        </div>

        {/* Statistiques */}
        {loadingStats ? (
          <div className="text-slate-600 text-center py-12">
            Chargement des statistiques...
          </div>
        ) : stats ? (
          <div className="space-y-6">
            {/* Graphiques */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-4">📈 Évolution des réservations (12 mois)</h2>
                <StatsChart data={stats.monthlyData} type="reservations" />
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-4">💰 Revenus et ventes (12 mois)</h2>
                <StatsChart data={stats.monthlyData} type="revenue" />
              </div>
            </div>

            {/* Revenus */}
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-4">💰 Revenus</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatsCard
                  title="Revenus totaux"
                  value={`${stats.revenue.total.toFixed(2)} €`}
                  icon="💵"
                  subtitle={`${stats.revenue.totalSales} vente${plural(stats.revenue.totalSales)}`}
                />
                <StatsCard
                  title="Prix moyen"
                  value={`${stats.revenue.average.toFixed(2)} €`}
                  icon="📊"
                  subtitle="Par création vendue"
                />
                <StatsCard
                  title="Ventes récentes (30j)"
                  value={`${stats.revenue.last30Days.toFixed(2)} €`}
                  icon="📈"
                  subtitle={`${stats.revenue.soldLast30Days} vente${plural(stats.revenue.soldLast30Days)}`}
                />
              </div>
            </div>

            {/* Créations */}
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-4">🧶 Créations</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatsCard
                  title="Total créations"
                  value={stats.creations.total}
                  icon="🎨"
                />
                <StatsCard
                  title="Disponibles"
                  value={stats.creations.available}
                  icon="🟢"
                  subtitle={`${calcPercent(stats.creations.available, stats.creations.total)}% du catalogue`}
                />
                <StatsCard
                  title="Réservées"
                  value={stats.creations.reserved}
                  icon="⏳"
                />
                <StatsCard
                  title="Vendues"
                  value={stats.creations.sold}
                  icon="✨"
                  subtitle={`${calcPercent(stats.creations.sold, stats.creations.total)}% du catalogue`}
                />
              </div>
            </div>

            {/* Réservations */}
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-4">📋 Réservations</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatsCard
                  title="Total réservations"
                  value={stats.reservations.total}
                  icon="📝"
                />
                <StatsCard
                  title="En attente"
                  value={stats.reservations.pending}
                  icon="⏰"
                  trend={{
                    value: `${stats.reservations.last7Days} nouvelle${plural(stats.reservations.last7Days)}`,
                    label: "cette semaine"
                  }}
                />
                <StatsCard
                  title="Validées"
                  value={stats.reservations.validated}
                  icon="✅"
                  trend={{
                    value: `${stats.reservations.validatedLast7Days}`,
                    label: "cette semaine"
                  }}
                />
                <StatsCard
                  title="Annulées"
                  value={stats.reservations.cancelled}
                  icon="❌"
                />
              </div>
            </div>

            {/* Activité récente */}
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-4">🔥 Activité récente</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatsCard
                  title="Réservations (7j)"
                  value={stats.reservations.last7Days}
                  icon="📅"
                  subtitle="7 derniers jours"
                />
                <StatsCard
                  title="Réservations (30j)"
                  value={stats.reservations.last30Days}
                  icon="📆"
                  subtitle="30 derniers jours"
                />
                <StatsCard
                  title="Validations (30j)"
                  value={stats.reservations.validatedLast30Days}
                  icon="✔️"
                  subtitle="30 derniers jours"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="text-slate-600 text-center py-12">
            Impossible de charger les statistiques
          </div>
        )}
      </div>
    </main>
  );
}

export default function StatsPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <StatsContent />
    </Suspense>
  );
}
