"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Card } from "@/components";

interface VersionInfo {
  version: string;
  git?: {
    commit: string;
    shortCommit: string;
    date: string;
    message: string;
    branch: string;
    author: string;
    tag?: string;
  };
  timestamp: string;
  nodeEnv: string;
}

export default function VersionPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Vérifier l'authentification en production
  useEffect(() => {
    const checkAuth = async () => {
      // En développement, on autorise tout le monde
      if (process.env.NODE_ENV === "development" || window.location.hostname.includes("localhost")) {
        setIsCheckingAuth(false);
        return;
      }

      // En production, vérifier que l'utilisateur est admin
      if (status === "loading") {
        return; // Attendre que la session soit chargée
      }

      if (status === "unauthenticated") {
        router.push("/login?error=admin_required");
        return;
      }

      if (session?.user?.role !== "admin") {
        setError("Accès non autorisé. Cette page est réservée aux administrateurs.");
        setIsCheckingAuth(false);
        setIsLoading(false);
        return;
      }

      setIsCheckingAuth(false);
    };

    checkAuth();
  }, [session, status, router]);

  useEffect(() => {
    if (isCheckingAuth) return;

    fetch("/api/version")
      .then((res) => {
        if (res.status === 403) {
          setError("Accès non autorisé. Réservé aux administrateurs.");
          setIsLoading(false);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        
        if (data.error) {
          setError(data.error);
        } else {
          setVersionInfo(data);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        setError("Impossible de charger les informations de version");
        setIsLoading(false);
        console.error(err);
      });
  }, [isCheckingAuth]);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });
    } catch {
      return dateString;
    }
  };

  if (isCheckingAuth || status === "loading") {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-slate-50">
          <div className="mx-auto max-w-4xl px-4 py-12">
            <Card className="p-8 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900"></div>
              <p className="mt-4 text-slate-600">Vérification de l'autorisation...</p>
            </Card>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              📦 Informations de version
            </h1>
            <p className="text-slate-600">
              Détails sur la version actuellement déployée
            </p>
          </div>

          {isLoading && (
            <Card className="p-8 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900"></div>
              <p className="mt-4 text-slate-600">Chargement...</p>
            </Card>
          )}

          {error && (
            <Card className="p-8 bg-red-50 border-red-200">
              <div className="flex items-center gap-2 text-red-600 mb-2">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="font-semibold">Erreur</p>
              </div>
              <p className="text-red-700">{error}</p>
            </Card>
          )}

          {versionInfo && (
            <div className="space-y-4">
              {/* Version */}
              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 mb-1">
                      Version de l'application
                    </h2>
                    <p className="text-2xl font-bold text-slate-900">
                      v{versionInfo.version}
                    </p>
                  </div>
                  <div className="text-4xl">📦</div>
                </div>
              </Card>

              {/* Informations Git */}
              {versionInfo.git && (
                <Card className="p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">
                    Informations Git
                  </h2>
                  <div className="space-y-3">
                    {/* Commit */}
                    <div className="flex items-start gap-3">
                      <div className="text-slate-500 text-sm font-medium min-w-[120px]">
                        Commit:
                      </div>
                      <div className="flex-1">
                        <code className="text-sm font-mono bg-slate-100 px-2 py-1 rounded text-slate-900">
                          {versionInfo.git.shortCommit}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(versionInfo.git!.commit);
                            alert("Hash du commit copié !");
                          }}
                          className="ml-2 text-xs text-blue-600 hover:text-blue-800 cursor-pointer"
                        >
                          📋 Copier le hash complet
                        </button>
                      </div>
                    </div>

                    {/* Message */}
                    <div className="flex items-start gap-3">
                      <div className="text-slate-500 text-sm font-medium min-w-[120px]">
                        Message:
                      </div>
                      <div className="flex-1 text-slate-900">
                        {versionInfo.git.message}
                      </div>
                    </div>

                    {/* Branche */}
                    <div className="flex items-start gap-3">
                      <div className="text-slate-500 text-sm font-medium min-w-[120px]">
                        Branche:
                      </div>
                      <div className="flex-1">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                          {versionInfo.git.branch}
                        </span>
                      </div>
                    </div>

                    {/* Tag */}
                    {versionInfo.git.tag && (
                      <div className="flex items-start gap-3">
                        <div className="text-slate-500 text-sm font-medium min-w-[120px]">
                          Tag:
                        </div>
                        <div className="flex-1">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                            {versionInfo.git.tag}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Auteur */}
                    <div className="flex items-start gap-3">
                      <div className="text-slate-500 text-sm font-medium min-w-[120px]">
                        Auteur:
                      </div>
                      <div className="flex-1 text-slate-900">
                        {versionInfo.git.author}
                      </div>
                    </div>

                    {/* Date */}
                    <div className="flex items-start gap-3">
                      <div className="text-slate-500 text-sm font-medium min-w-[120px]">
                        Date:
                      </div>
                      <div className="flex-1 text-slate-900">
                        {formatDate(versionInfo.git.date)}
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Informations système */}
              <Card className="p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">
                  Informations système
                </h2>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="text-slate-500 text-sm font-medium min-w-[120px]">
                      Environnement:
                    </div>
                    <div className="flex-1">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                          versionInfo.nodeEnv === "production"
                            ? "bg-green-100 text-green-800"
                            : versionInfo.nodeEnv === "staging"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {versionInfo.nodeEnv}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="text-slate-500 text-sm font-medium min-w-[120px]">
                      Dernière mise à jour:
                    </div>
                    <div className="flex-1 text-slate-900">
                      {formatDate(versionInfo.timestamp)}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
