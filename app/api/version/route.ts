import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { checkAdminAuth } from "@/lib/auth";

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
      // Récupérer le hash du dernier commit
      const commit = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
      const shortCommit = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
      
      // Récupérer la date du commit
      const date = execSync("git log -1 --format=%ci", { encoding: "utf-8" }).trim();
      
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

    return NextResponse.json({
      version,
      git: gitInfo,
      timestamp: new Date().toISOString(),
      nodeEnv: environment,
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
