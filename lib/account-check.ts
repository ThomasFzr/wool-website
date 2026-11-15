import { connectToDatabase } from "@/lib/db";
import User, { IUserDocument } from "@/models/User";

/** Durée de validité d'une vérification du compte (rôle, suppression, mot de passe changé). */
export const ACCOUNT_CHECK_TTL = 5 * 60 * 1000;
const MAX_ENTRIES = 1000;

export type AccountState = {
  role: "user" | "admin";
  userId: string;
  /** Date (ms) du dernier changement de mot de passe */
  passwordChangedAt?: number;
} | null;

// Dernière vérification par email, propre à l'instance. Un rendu serveur (getServerSession)
// ne peut pas réécrire le cookie de session : le token reste « périmé » et, sans ce cache,
// chaque rendu relisait le compte en base passé les 5 premières minutes.
const cache = new Map<string, { checkedAt: number; state: AccountState }>();

/**
 * État du compte en base (null s'il a été supprimé), relu au plus toutes les
 * ACCOUNT_CHECK_TTL ms par instance ; `fresh` force la relecture. `checkedAt` est la date
 * de la lecture réellement faite, pour ne pas prolonger le délai de prise en compte.
 */
export async function lookupAccount(
  email: string,
  { fresh = false }: { fresh?: boolean } = {}
): Promise<{ checkedAt: number; state: AccountState }> {
  const hit = cache.get(email);
  if (!fresh && hit && Date.now() - hit.checkedAt < ACCOUNT_CHECK_TTL) return hit;

  await connectToDatabase();
  const dbUser = await User.findOne({ email }).lean<IUserDocument | null>();
  const state: AccountState = dbUser
    ? {
        role: dbUser.role,
        userId: dbUser._id.toString(),
        passwordChangedAt: dbUser.passwordChangedAt ? new Date(dbUser.passwordChangedAt).getTime() : undefined,
      }
    : null;

  if (cache.size >= MAX_ENTRIES) cache.clear();
  const entry = { checkedAt: Date.now(), state };
  cache.set(email, entry);
  return entry;
}

/** Vide le cache (tests). */
export function resetAccountCheckCache() {
  cache.clear();
}
