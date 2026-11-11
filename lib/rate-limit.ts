import RateLimit from "@/models/RateLimit";

/**
 * Limites de débit partagées entre instances (MongoDB), en fenêtres fixes.
 *
 * Une limite en mémoire ne vaut rien en serverless : chaque instance a la sienne. En cas
 * d'erreur de base, on laisse passer (la requête échouera de toute façon plus loin) plutôt
 * que de bloquer tout le monde. À compléter par les règles du pare-feu Vercel.
 */

function bucket(key: string, windowMs: number) {
  const start = Math.floor(Date.now() / windowMs) * windowMs;
  return { id: `${key}:${start}`, expiresAt: new Date(start + windowMs) };
}

/** Compte une requête pour `key` et renvoie le total de la fenêtre courante (elle comprise). */
export async function hitRateLimit(key: string, windowMs: number): Promise<number> {
  const { id, expiresAt } = bucket(key, windowMs);
  try {
    const doc = await RateLimit.findOneAndUpdate(
      { _id: id },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, new: true }
    ).lean<{ count: number }>();
    return doc!.count;
  } catch (err) {
    console.error("[rate-limit] Compteur indisponible:", err);
    return 0;
  }
}

/** Nombre de requêtes déjà comptées pour `key` dans la fenêtre courante, sans en ajouter. */
export async function rateLimitCount(key: string, windowMs: number): Promise<number> {
  try {
    const doc = await RateLimit.findById(bucket(key, windowMs).id).lean<{ count: number } | null>();
    return doc?.count ?? 0;
  } catch (err) {
    console.error("[rate-limit] Compteur indisponible:", err);
    return 0;
  }
}

type HeaderSource = Headers | Record<string, string | string[] | undefined> | undefined;

/**
 * Adresse IP du client. Sur Vercel, `x-real-ip` et `x-forwarded-for` sont posés par la
 * plateforme (une valeur envoyée par le client est écrasée).
 */
export function clientIp(headers: HeaderSource): string {
  const get = (name: string): string | undefined => {
    if (!headers) return undefined;
    if (headers instanceof Headers) return headers.get(name) ?? undefined;
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const ip = get("x-real-ip") || get("x-forwarded-for")?.split(",")[0];
  return ip?.trim() || "unknown";
}
