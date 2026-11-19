import { NextResponse } from "next/server";
import { z } from "zod";
import { PASSWORD_MESSAGES } from "@/lib/password-policy";

/**
 * Validation centralisée des entrées des routes d'API (docs/SECURITY.md, A03).
 *
 * Chaque route décrit son body, ses paramètres d'URL et sa query string par un schéma zod,
 * puis les lit avec parseBody / parseParams / parseQuery. Une entrée refusée donne toujours
 * la même réponse : 400, `{ error, champ }`, avec un message en français qui nomme le champ
 * fautif sans rien révéler du fonctionnement interne (ni pile d'appels, ni type attendu, ni
 * valeur reçue). Les clés inconnues sont retirées (pas d'affectation de masse), et un objet
 * `{ "$ne": null }` à la place d'une chaîne est refusé avant d'atteindre MongoDB.
 */

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

const fieldName = (path: readonly PropertyKey[] | undefined) =>
  (path ?? []).map(String).join(".");

/**
 * Message par défaut quand le schéma n'en donne pas : un champ manquant ou invalide.
 * Ne reprend jamais la valeur reçue ni le détail technique de l'erreur zod.
 */
const defaultMessage: z.core.$ZodErrorMap = (issue) => {
  const champ = fieldName(issue.path);
  if (!champ) return "Le corps de la requête doit être un objet JSON.";
  if (issue.code === "invalid_type" && issue.input === undefined) return `Champ « ${champ} » requis.`;
  return `Champ « ${champ} » invalide.`;
};

/** Réponse 400 pour une entrée refusée (premier problème rencontré). */
export function invalidInput(error: z.ZodError): NextResponse {
  const [issue] = error.issues;
  const champ = fieldName(issue.path);
  return NextResponse.json({ error: issue.message, ...(champ && { champ }) }, { status: 400 });
}

/** Valide une valeur déjà lue (paramètres de route, query string, body). */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): Parsed<z.output<S>> {
  const result = schema.safeParse(input, { error: defaultMessage });
  return result.success ? { ok: true, data: result.data } : { ok: false, response: invalidInput(result.error) };
}

/** Lit et valide le body JSON. Un body absent ou qui n'est pas du JSON donne aussi un 400. */
export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<Parsed<z.output<S>>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Le corps de la requête doit être un objet JSON." }, { status: 400 }),
    };
  }
  return parseInput(schema, body);
}

/** Valide les paramètres d'une route dynamique (`params` de Next, une Promise). */
export async function parseParams<S extends z.ZodType>(
  params: Promise<unknown>,
  schema: S
): Promise<Parsed<z.output<S>>> {
  return parseInput(schema, await params);
}

/** Valide la query string ; une clé répétée garde sa première valeur. */
export function parseQuery<S extends z.ZodType>(searchParams: URLSearchParams, schema: S): Parsed<z.output<S>> {
  const query: Record<string, string> = {};
  for (const [key, value] of searchParams) if (!(key in query)) query[key] = value;
  return parseInput(schema, query);
}

// ─── Briques communes ──────────────────────────────────────────────────────────────────

/** Identifiant MongoDB : exactement 24 caractères hexadécimaux, avec le message donné. */
export const objectIdOf = (message: string) => z.string(message).regex(/^[a-f\d]{24}$/i, message);

export const objectId = objectIdOf("Identifiant invalide.");

/** Paramètre de route `[id]` d'un document MongoDB. */
export const idParams = z.object({ id: objectId });

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Adresse email, normalisée (espaces retirés, minuscules) comme en base. */
export const email = z
  .string("Adresse email requise.")
  .trim()
  .min(1, "Adresse email requise.")
  .max(254, "L'adresse email dépasse la longueur maximale autorisée.")
  .regex(EMAIL_REGEX, "Adresse email invalide.")
  .toLowerCase();

/**
 * Mot de passe saisi : une chaîne bornée. La politique (longueur minimale, fuites connues)
 * reste dans lib/password-policy, appelée par la route, car elle interroge une API externe.
 */
export const password = z
  .string(PASSWORD_MESSAGES.required)
  .min(1, PASSWORD_MESSAGES.required)
  .max(256, "Le mot de passe dépasse la longueur maximale autorisée (256 caractères).");

const tooLong = (max: number) => `Un champ dépasse la longueur maximale autorisée (${max} caractères).`;

/** Texte libre, espaces de début et fin retirés. */
export const text = (max: number) => z.string().trim().max(max, tooLong(max));

/** Texte obligatoire (non vide après trim). */
export const requiredText = (max: number, message: string) =>
  z.string(message).trim().min(1, message).max(max, tooLong(max));

/** Entier ≥ 1 lu dans l'URL ; valeur absente ou incorrecte → valeur par défaut, bornée à max. */
export const pageNumber = (fallback: number, max = Number.MAX_SAFE_INTEGER) =>
  z.preprocess((v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback;
  }, z.number());

/** Liste d'identifiants séparés par des virgules (`?ids=a,b`) ; les entrées invalides sont ignorées. */
export const idList = (max: number) =>
  z
    .string()
    .max(max * 25, "Trop d'identifiants.")
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => objectId.safeParse(id).success)
    );
