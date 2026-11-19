/** Mots de passe que le faux HIBP des tests unitaires considère comme compromis. */
export const PWNED_PASSWORDS = ["password123", "azertyuiop", "motdepasse"];

/** Remplaçant de pwnedCount (lib/hibp) : aucun test unitaire n'appelle la vraie API. */
export async function fakePwnedCount(password: string): Promise<number | null> {
  return PWNED_PASSWORDS.includes(password) ? 42 : 0;
}
