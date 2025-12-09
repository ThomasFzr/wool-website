"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export default function GenerateSlugsPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function handleGenerate() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/admin/generate-slugs", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de la génération des slugs");
        return;
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || "Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">
          Générer les slugs SEO
        </h1>

        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <p className="text-slate-700">
            Cette action va générer des slugs SEO-friendly pour toutes les créations qui n'en ont pas encore.
          </p>
          <p className="text-sm text-slate-500">
            Exemple : <code className="bg-slate-100 px-2 py-1 rounded">bonnet-rouge-laine</code> au lieu de <code className="bg-slate-100 px-2 py-1 rounded">693695e4d922f39c20910b1a</code>
          </p>

          <Button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full"
          >
            {loading ? "Génération en cours..." : "Générer les slugs"}
          </Button>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">
              ❌ {error}
            </div>
          )}

          {result && (
            <div className="bg-green-50 border border-green-200 rounded p-4 space-y-2">
              <p className="font-semibold text-green-900">
                ✅ {result.count} slug{result.count > 1 ? "s" : ""} généré{result.count > 1 ? "s" : ""} avec succès !
              </p>
              {result.slugs && result.slugs.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-green-800 mb-2">Détails :</p>
                  <ul className="space-y-1 text-sm text-green-700">
                    {result.slugs.map((item: any, idx: number) => (
                      <li key={idx} className="flex justify-between">
                        <span>{item.title}</span>
                        <code className="bg-green-100 px-2 py-0.5 rounded text-xs">
                          {item.slug}
                        </code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-6">
          <a
            href="/admin"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Retour à l'admin
          </a>
        </div>
      </div>
    </div>
  );
}
