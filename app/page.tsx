"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Creation = {
  _id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  price?: number;
};

export default function HomePage() {
  const [creations, setCreations] = useState<Creation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/creations");
        const data = await res.json();
        setCreations(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Les créations en laine de maman 🧶
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Une petite galerie pour partager ses tricots avec ses amies.
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition"
          >
            Espace admin
          </Link>
        </header>

        {/* Contenu */}
        {loading && (
          <p className="text-sm text-slate-500">Chargement des créations...</p>
        )}

        {!loading && creations.length === 0 && (
          <p className="text-sm text-slate-500">
            Aucune création pour le moment. Ajoute-en depuis l&apos;espace
            admin.
          </p>
        )}

        <section className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {creations.map((c) => (
            <article
              key={c._id}
              className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100"
            >
              <div className="relative h-56 w-full overflow-hidden bg-slate-100">
                {c.imageUrl ? (
                  <img
                    src={c.imageUrl}
                    alt={c.title}
                    className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
                    Pas d&apos;image
                  </div>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">
                    {c.title}
                  </h2>
                  {c.price != null && (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">
                      {c.price} €
                    </span>
                  )}
                </div>

                {c.description && (
                  <p className="line-clamp-3 text-xs text-slate-600">
                    {c.description}
                  </p>
                )}
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}