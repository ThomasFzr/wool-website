"use client";

import Link from "next/link";
import { useState, useEffect, Suspense } from "react";
import { StatsCard, StatsChart } from "@/components";
import { Accordion } from "@/components/ui";
import { optimizeCloudinaryUrl } from "@/lib/imageOptimizer";

// Composant de chargement réutilisable
const LoadingScreen = () => (
  <main className="min-h-screen flex items-center justify-center bg-slate-50">
    <div className="text-slate-600">Chargement...</div>
  </main>
);

function StatsContent() {
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  async function loadStats() {
    try {
      setLoadingStats(true);
      const res = await fetch("/api/admin/stats");
      if (!res.ok) return;
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStats(false);
    }
  }

  // La garde admin est assurée côté serveur par app/admin/layout.tsx
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadStats();
  }, []);

  // Fonction helper pour calculer les pourcentages
  const calcPercent = (value: number, total: number) => 
    total > 0 ? ((value / total) * 100).toFixed(0) : '0';

  // Fonction helper pour le pluriel
  const plural = (count: number, singular: string = '') => 
    count > 1 ? 's' : singular;

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
            Vue d&apos;ensemble de vos ventes et commandes
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
                <h2 className="text-lg font-bold text-slate-900 mb-4">📈 Évolution des commandes (12 mois)</h2>
                <StatsChart data={stats.monthlyData} type="orders" />
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-4">💰 Revenus et ventes (12 mois)</h2>
                <StatsChart data={stats.monthlyData} type="revenue" />
              </div>
            </div>
            
            {/* Graphique coûts vs profits */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">📊 Coûts vs Revenus - Profit (12 mois)</h2>
              <StatsChart data={stats.monthlyData} type="profit" />
            </div>

            {/* Revenus */}
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-4">💰 Revenus</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
              
              {/* Détails des créations vendues */}
              {stats.revenue.soldCreations && stats.revenue.soldCreations.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                  <Accordion
                    items={[
                      {
                        title: `📦 Détails des créations vendues (${stats.revenue.soldCreations.length} article${stats.revenue.soldCreations.length > 1 ? 's' : ''})`,
                        content: (
                          <div className="max-h-96 overflow-y-auto pr-2 space-y-3">
                            {stats.revenue.soldCreations.map((creation: any, index: number) => (
                              <div
                                key={creation._id}
                                className="flex items-center gap-4 p-3 rounded-lg border border-slate-200 bg-slate-50"
                              >
                                {creation.imageUrl && (
                                  <img
                                    src={optimizeCloudinaryUrl(creation.imageUrl, { width: 200 })}
                                    alt={creation.title}
                                    title={creation.title}
                                    className="w-16 h-16 object-cover rounded shrink-0"
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-slate-900 truncate">
                                    {creation.title}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="font-semibold text-slate-900">
                                    {creation.totalRevenue.toFixed(2)} €
                                  </p>
                                  <p className="text-xs text-slate-500 mt-1">
                                    {creation.salesCount} vente{creation.salesCount > 1 ? 's' : ''} × {creation.price.toFixed(2)} €
                                  </p>
                                  {creation.unitCost > 0 && (
                                    <p className="text-xs text-slate-400 mt-1">
                                      Coût : {creation.totalCost.toFixed(2)} €
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ),
                      },
                    ]}
                  />
                </div>
              )}
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
                  title="Vendues"
                  value={stats.creations.sold}
                  icon="✨"
                  subtitle={`${calcPercent(stats.creations.sold, stats.creations.total)}% du catalogue`}
                />
              </div>
            </div>

            {/* Commandes */}
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-4">📋 Commandes</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatsCard
                  title="Total commandes"
                  value={stats.orders.total}
                  icon="📝"
                />
                <StatsCard
                  title="En préparation"
                  value={stats.orders.preparing}
                  icon="⏰"
                  trend={{
                    value: `${stats.orders.last7Days} nouvelle${plural(stats.orders.last7Days)}`,
                    label: "cette semaine"
                  }}
                />
                <StatsCard
                  title="Validées"
                  value={stats.orders.validated}
                  icon="✅"
                  trend={{
                    value: `${stats.orders.validatedLast7Days}`,
                    label: "cette semaine"
                  }}
                />
                <StatsCard
                  title="Annulées"
                  value={stats.orders.cancelled}
                  icon="❌"
                />
              </div>
            </div>

            {/* Activité récente */}
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-4">🔥 Activité récente</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatsCard
                  title="Commandes (7j)"
                  value={stats.orders.last7Days}
                  icon="📅"
                  subtitle="7 derniers jours"
                />
                <StatsCard
                  title="Commandes (30j)"
                  value={stats.orders.last30Days}
                  icon="📆"
                  subtitle="30 derniers jours"
                />
                <StatsCard
                  title="Validations (30j)"
                  value={stats.orders.validatedLast30Days}
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
