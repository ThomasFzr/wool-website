function hostOf(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function isLocalHost(host: string): boolean {
  const hostname = host.split(":")[0];
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * Un en-tête `Host` est fourni par le client : on ne l'accepte que s'il
 * correspond à une origine légitime de l'application (domaine configuré,
 * déploiement Vercel, ou machine locale). Sinon on retombe sur l'environnement.
 */
function isAllowedHost(host: string): boolean {
  if (isLocalHost(host)) return true;
  if (host === hostOf(process.env.NEXT_PUBLIC_APP_URL)) return true;
  if (host === hostOf(process.env.NEXTAUTH_URL)) return true;
  if (host === process.env.VERCEL_PROJECT_PRODUCTION_URL) return true;
  if (host === process.env.VERCEL_URL) return true;
  // Déploiements de preview Vercel
  if (host.endsWith(".vercel.app")) return true;
  return false;
}

/**
 * URL de base de l'application.
 *
 * Quand une requête est disponible, on privilégie SON origine : une redirection
 * (success_url Stripe, lien de reset…) doit ramener l'utilisateur sur le site
 * qu'il est en train de visiter. Utiliser NEXT_PUBLIC_APP_URL en priorité
 * enverrait un test en local vers la production — donc vers une autre session,
 * un autre panier et une autre base.
 *
 * L'en-tête Host étant falsifiable, il est validé contre les origines connues
 * (cf. isAllowedHost) ; à défaut on utilise NEXT_PUBLIC_APP_URL, qui reste la
 * seule source possible hors contexte de requête (webhook, cron, script).
 */
export function getAppUrl(headers?: Headers): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  if (headers) {
    const host = headers.get("host");
    if (host && isAllowedHost(host)) {
      const proto =
        headers.get("x-forwarded-proto") || (isLocalHost(host) ? "http" : "https");
      return `${proto}://${host}`;
    }
  }

  if (envUrl) return envUrl;

  return "http://localhost:3000";
}
