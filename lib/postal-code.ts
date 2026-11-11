/** Code postal normalisé : sans espaces, en majuscules ("75 011" → "75011"). */
export function normalizePostalCode(code: unknown): string {
  return typeof code === "string" ? code.replace(/\s+/g, "").toUpperCase() : "";
}

/**
 * Le retrait sur place est-il ouvert à ce code postal ? Un code autorisé vaut pour tous
 * les codes qui commencent par lui (« 75 » couvre 75001, 75011…). L'inverse n'est pas
 * vrai : un code partiel ou vide saisi par le client (« 7 », « ») n'ouvre rien.
 * Partagé par le panier (affichage) et la création du paiement (contrôle serveur).
 */
export function isPostalCodeAllowed(userCode: unknown, allowedCodes: unknown[]): boolean {
  const code = normalizePostalCode(userCode);
  if (!code) return false;
  return allowedCodes
    .map(normalizePostalCode)
    .some((allowed) => allowed !== "" && code.startsWith(allowed));
}
