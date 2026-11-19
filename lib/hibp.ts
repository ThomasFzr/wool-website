/**
 * Recherche d'un mot de passe dans les fuites connues, via l'API « Pwned Passwords » de
 * Have I Been Pwned (https://haveibeenpwned.com/API/v3#PwnedPasswords).
 *
 * k-anonymity : seuls les 5 premiers caractères du SHA-1 du mot de passe quittent le
 * serveur ; l'API renvoie tous les suffixes connus pour ce préfixe et la comparaison se
 * fait ici. L'en-tête Add-Padding ajoute de faux suffixes (compte 0) pour que la taille de
 * la réponse ne trahisse rien non plus.
 *
 * HIBP_API_BASE_URL permet de viser un faux serveur (tests e2e).
 */

const DEFAULT_BASE_URL = "https://api.pwnedpasswords.com";
// Au-delà, on renonce : une inscription ne doit pas attendre une API tierce.
const TIMEOUT_MS = 2000;

async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * Nombre d'apparitions du mot de passe dans les fuites connues (0 s'il n'y figure pas),
 * ou null si l'API n'a pas répondu correctement : à l'appelant de ne pas bloquer.
 */
export async function pwnedCount(password: string): Promise<number | null> {
  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const base = process.env.HIBP_API_BASE_URL || DEFAULT_BASE_URL;

    const res = await fetch(`${base}/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[hibp] Réponse ${res.status}, mot de passe non vérifié`);
      return null;
    }

    for (const line of (await res.text()).split("\n")) {
      const [candidate, count] = line.trim().split(":");
      if (candidate === suffix) return Number(count) || 0;
    }
    return 0;
  } catch (err) {
    console.warn("[hibp] API injoignable, mot de passe non vérifié:", err);
    return null;
  }
}
