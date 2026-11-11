function hostOf(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function isLocalHost(host: string): boolean {
  let url: URL;
  try {
    url = new URL(`http://${host}`);
  } catch {
    return false;
  }
  // L'hôte doit être exactement « nom[:port] » (pas de chemin ni d'identifiants glissés)
  if (url.host !== host) return false;
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
}

/**
 * Un en-tête `Host` est fourni par le client : on ne l'accepte que s'il
 * correspond à une origine légitime de l'application (domaine configuré, URL de CE
 * déploiement Vercel, ou machine locale hors production). Sinon on retombe sur
 * l'environnement. N'importe quel *.vercel.app n'est pas accepté : un lien de
 * réinitialisation pourrait sinon pointer vers le site d'un tiers.
 */
function isAllowedHost(host: string): boolean {
  if (isLocalHost(host)) return process.env.VERCEL_ENV !== "production";
  const allowed = [
    hostOf(process.env.NEXT_PUBLIC_APP_URL),
    hostOf(process.env.NEXTAUTH_URL),
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
  ];
  return allowed.some((h) => h && h === host);
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

/**
 * URL de base des liens envoyés par email (réinitialisation du mot de passe, commandes).
 * En production, toujours le domaine officiel NEXT_PUBLIC_APP_URL, jamais un hôte tiré
 * de la requête ; ailleurs (local, preview), l'origine de la requête pour pouvoir tester.
 */
export function getEmailBaseUrl(headers?: Headers): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (process.env.VERCEL_ENV === "production" && envUrl) return envUrl;
  return getAppUrl(headers);
}
