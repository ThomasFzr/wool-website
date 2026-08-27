// Échappe les caractères HTML d'une donnée utilisateur avant interpolation
// dans un template d'email (anti injection HTML/phishing).
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Échappe les métacaractères regex d'une saisie utilisateur avant de
// construire un $regex MongoDB (anti injection regex / ReDoS).
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
