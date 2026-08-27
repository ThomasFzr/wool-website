"use client";

import { useEffect, useState } from "react";

export function EnvironmentBanner() {
  const [envInfo, setEnvInfo] = useState<{
    isDev: boolean;
    isLocalDb: boolean;
    dbName: string | null;
  } | null>(null);

  useEffect(() => {
    // Détecter l'environnement : ne rien faire (aucun fetch) hors localhost
    const isDev =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (!isDev) return;

    // Récupérer les infos de la base de données via une API (dev uniquement)
    fetch("/api/env-info")
      .then((res) => res.json())
      .then((data) => {
        setEnvInfo({
          isDev,
          isLocalDb: data.isLocalDb || false,
          dbName: data.dbName || null,
        });
      })
      .catch(() => {
        // Si l'API n'existe pas, on détecte juste l'environnement
        setEnvInfo({
          isDev,
          isLocalDb: false,
          dbName: null,
        });
      });
  }, []);

  // Ne pas afficher en production
  if (!envInfo || !envInfo.isDev) return null;

  const isLocalDb = envInfo.isLocalDb;
  const dbName = envInfo.dbName;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 border-b-2 px-4 py-2 text-center text-xs font-bold shadow-sm ${
        isLocalDb
          ? "bg-green-100 border-green-500 text-green-900"
          : "bg-red-100 border-red-500 text-red-900"
      }`}
      style={{ paddingTop: "env(safe-area-inset-top, 0)" }}
    >
      <div className="flex items-center justify-center gap-2">
        {isLocalDb ? (
          <>
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              🛡️ MODE DÉVELOPPEMENT - Base locale: {dbName || "localhost"}
            </span>
          </>
        ) : (
          <>
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>
              ⚠️ ATTENTION - Base de données distante détectée !
            </span>
          </>
        )}
      </div>
    </div>
  );
}
