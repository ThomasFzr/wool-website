import { expect, vi } from "vitest";
import { getServerSession } from "next-auth";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import User from "@/models/User";
import { asAdmin, asAnonymous, asUser } from "./session";

/** Crée une création valide (champs requis renseignés), surchargeable. */
export function createCreation(overrides: Record<string, unknown> = {}) {
  return Creation.create({
    title: "Pull en laine",
    price: 50,
    color: "Bleu",
    type: "pull",
    ...overrides,
  });
}

export function createUser(overrides: Record<string, unknown> = {}) {
  return User.create({ email: "client@example.com", provider: "credentials", ...overrides });
}

export function createReservation(overrides: Record<string, unknown> = {}) {
  return Reservation.create({ name: "Alice", contact: "client@example.com", ...overrides });
}

/** Fait échouer la vérification de session pour emprunter la branche 500 des routes. */
export function failSession() {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(getServerSession).mockRejectedValue(new Error("session indisponible"));
}

/**
 * Vérifie le contrôle d'accès admin : anonyme et utilisateur non admin sont refusés (401).
 * `call` exécute la route ; l'état de la base n'est pas pertinent ici.
 */
export async function expectAdminOnly(call: () => Promise<Response>) {
  asAnonymous();
  expect((await call()).status).toBe(401);
  asUser();
  expect((await call()).status).toBe(401);
  asAdmin();
  expect((await call()).status).not.toBe(401);
}
