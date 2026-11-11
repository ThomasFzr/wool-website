import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { checkAdminAuth } from "@/lib/auth";

// Fonction helper pour normaliser une date en format ISO
function normalizeDate(dateString: string | undefined): string {
  if (!dateString) {
    return new Date().toISOString();
  }
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

// Les infos version/git ne changent pas pendant la vie du process :
// calculées une seule fois (les execSync git sont bloquants) puis mises en cache
let cachedVersionInfo: { version: string; git: any; nodeEnv: string } | null = null;

export async function GET() {
  try {
    // Vérifier que l'utilisateur est admin en production
    const isProduction = process.env.VERCEL_ENV === "production" ||
                         (process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV);

    if (isProduction) {
      const session = await checkAdminAuth();
      if (!session) {
        return NextResponse.json(
          { error: "Accès non autorisé. Réservé aux administrateurs." },
          { status: 403 }
        );
      }
    }

    if (cachedVersionInfo) {
      return NextResponse.json({
        ...cachedVersionInfo,
        timestamp: new Date().toISOString(),
      });
    }

    // Récupérer la version depuis package.json
    const packageJsonPath = join(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    const version = packageJson.version || "unknown";

    // Récupérer les informations Git
    let gitInfo: {
      commit: string;
      shortCommit: string;
      date: string;
      message: string;
      branch: string;
      author: string;
      tag?: string;
    } | null = null;

    try {
      // Priorité 1: Utiliser les variables d'environnement Vercel (disponibles en production/staging)
      if (process.env.VERCEL_GIT_COMMIT_SHA) {
        const commit = process.env.VERCEL_GIT_COMMIT_SHA;
        const shortCommit = commit.substring(0, 7);
        const message = process.env.VERCEL_GIT_COMMIT_MESSAGE || "N/A";
        const branch = process.env.VERCEL_GIT_COMMIT_REF || "unknown";
        const author = process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME || process.env.VERCEL_GIT_COMMIT_AUTHOR_LOGIN || "unknown";
        
        // Pour la date, essayer plusieurs sources dans l'ordre de priorité
        let date: string;
        
        // 1. Essayer une variable d'environnement personnalisée (si définie dans le build)
        if (process.env.VERCEL_GIT_COMMIT_DATE) {
          date = normalizeDate(process.env.VERCEL_GIT_COMMIT_DATE);
        } else {
          // 2. Essayer de récupérer depuis Git si disponible (peut fonctionner dans certains contextes)
          try {
            const gitDate = execSync("git log -1 --format=%ci", { encoding: "utf-8" }).trim();
            if (gitDate) {
              date = normalizeDate(gitDate);
            } else {
              date = new Date().toISOString();
            }
          } catch {
            // Si Git n'est pas disponible, on garde la date actuelle comme fallback
            // Note: En production/staging sur Vercel, Git n'est généralement pas disponible
            // La date sera donc la date actuelle, ce qui n'est pas idéal mais fonctionnel
            date = new Date().toISOString();
          }
        }

        // Récupérer le tag s'il existe
        let tag: string | undefined;
        try {
          tag = execSync("git describe --tags --exact-match HEAD 2>/dev/null", { encoding: "utf-8" }).trim() || undefined;
        } catch {
          // Pas de tag
        }

        gitInfo = {
          commit,
          shortCommit,
          date,
          message,
          branch,
          author,
          tag,
        };
      } else {
        // Priorité 2: Utiliser les commandes Git (pour le développement local)
        // Récupérer le hash du dernier commit
        const commit = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
        const shortCommit = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
        
        // Récupérer la date du commit
        const gitDate = execSync("git log -1 --format=%ci", { encoding: "utf-8" }).trim();
        const date = normalizeDate(gitDate);
        
        // Récupérer le message du commit
        const message = execSync("git log -1 --format=%s", { encoding: "utf-8" }).trim();
        
        // Récupérer la branche actuelle
        let branch = "unknown";
        try {
          branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
        } catch {
          // Si on est dans un état détaché, essayer de récupérer le tag ou la branche
          try {
            branch = execSync("git describe --tags --exact-match HEAD 2>/dev/null || git describe --all HEAD", { encoding: "utf-8" }).trim();
          } catch {
            branch = "detached";
          }
        }
        
        // Récupérer l'auteur du commit
        const author = execSync("git log -1 --format=%an", { encoding: "utf-8" }).trim();
        
        // Récupérer le tag s'il existe
        let tag: string | undefined;
        try {
          tag = execSync("git describe --tags --exact-match HEAD 2>/dev/null", { encoding: "utf-8" }).trim() || undefined;
        } catch {
          // Pas de tag
        }

        gitInfo = {
          commit,
          shortCommit,
          date,
          message,
          branch,
          author,
          tag,
        };
      }
    } catch (error) {
      // Si Git n'est pas disponible (par exemple en production sur certaines plateformes)
      console.warn("Impossible de récupérer les informations Git:", error);
    }

    // Détecter l'environnement de manière plus précise
    // Vercel fournit VERCEL_ENV qui peut être: development, preview (staging), ou production
    let environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
    
    // Normaliser les valeurs pour l'affichage
    if (environment === "preview") {
      environment = "staging";
    }

    cachedVersionInfo = {
      version,
      git: gitInfo,
      nodeEnv: environment,
    };

    return NextResponse.json({
      ...cachedVersionInfo,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Erreur lors de la récupération de la version:", error);
    return NextResponse.json(
      {
        error: "Impossible de récupérer les informations de version",
        version: "unknown",
      },
      { status: 500 }
    );
  }
}
