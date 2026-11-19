import { pwnedCount } from "@/lib/hibp";

/**
 * Politique de mot de passe, commune à l'inscription, à la réinitialisation, au changement
 * depuis le compte et à la création ou modification par un admin (docs/SECURITY.md, A07) :
 * une longueur minimale, aucune règle de composition, et le refus des mots de passe
 * présents dans des fuites connues (Have I Been Pwned).
 *
 * Utilisable côté client pour la longueur et les messages (aucune dépendance Node).
 */

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_MESSAGES = {
  required: "Le mot de passe est requis.",
  tooShort: `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`,
  pwned:
    "Ce mot de passe apparaît dans des fuites de données connues : choisissez-en un autre. " +
    "Une phrase de plusieurs mots est à la fois plus sûre et plus facile à retenir.",
} as const;

/** Longueur en caractères, pas en unités UTF-16 : un emoji compte pour un. */
export function passwordLength(password: string): number {
  return [...password].length;
}

/** Présent dans une fuite connue ; false si l'API ne répond pas (on ne bloque jamais). */
async function isPwned(password: string): Promise<boolean> {
  const count = await pwnedCount(password);
  return count !== null && count > 0;
}

/**
 * Vérifie un nouveau mot de passe. Renvoie le message d'erreur à afficher, ou null s'il
 * est accepté. Si l'API des fuites ne répond pas, le mot de passe est accepté : la
 * vérification ne doit jamais bloquer une inscription.
 */
export async function checkNewPassword(password: unknown): Promise<string | null> {
  if (typeof password !== "string" || password.length === 0) return PASSWORD_MESSAGES.required;
  if (passwordLength(password) < PASSWORD_MIN_LENGTH) return PASSWORD_MESSAGES.tooShort;
  if (await isPwned(password)) return PASSWORD_MESSAGES.pwned;
  return null;
}

/** Faiblesse d'un mot de passe existant, constatée à la connexion. */
export type PasswordWarning = "short" | "pwned";

export const PASSWORD_WARNING_MESSAGES: Record<PasswordWarning, string> = {
  short: `Votre mot de passe fait moins de ${PASSWORD_MIN_LENGTH} caractères.`,
  pwned: "Votre mot de passe apparaît dans des fuites de données connues.",
};

/**
 * À la connexion réussie : le mot de passe est-il trop court ou compromis ? Les mots de
 * passe existants ne sont pas invalidés, la connexion passe et un bandeau invite à le
 * changer (components/PasswordWarningBanner). API des fuites injoignable : pas d'alerte.
 */
export async function passwordWarning(password: string): Promise<PasswordWarning | null> {
  if (passwordLength(password) < PASSWORD_MIN_LENGTH) return "short";
  return (await isPwned(password)) ? "pwned" : null;
}
