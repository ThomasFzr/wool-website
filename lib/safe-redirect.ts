const BASE = "http://local.invalid";

/**
 * Chemin interne sûr où renvoyer l'utilisateur après connexion ("/" sinon).
 *
 * Le callbackUrl vient de l'URL : sans contrôle, `/login?callbackUrl=https://phishing.example`
 * renverrait vers un autre site après une vraie connexion (open redirect). On résout la valeur
 * comme le ferait le navigateur, ce qui écarte aussi `//hote`, `/\hote` ou `/\t/hote`.
 */
export function safeCallbackPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) return "/";
  try {
    const url = new URL(value, BASE);
    if (url.origin !== BASE) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
