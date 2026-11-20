/* eslint-disable @typescript-eslint/no-explicit-any -- tableau hétérogène de routes : chaque
   route a son propre contexte (documents créés) et ses propres entrées, valides ou non */
import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { connectToDatabase } from "@/lib/db";
import { generateProductDescription } from "@/lib/gemini";
import { sendEmail } from "@/lib/sendEmail";
import Contact from "@/models/Contact";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import User from "@/models/User";
import YarnBrand from "@/models/YarnBrand";
import Settings from "@/models/Settings";
import { makeRequest, routeParams } from "../../helpers/http";
import { asAdmin, asUser } from "../../helpers/session";
import { installFakeStripe, paidSession } from "../../helpers/stripe-fake";

import { POST as register } from "@/app/api/register/route";
import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route";
import { POST as resetPassword } from "@/app/api/auth/reset-password/route";
import { POST as contact } from "@/app/api/contact/route";
import { GET as availability } from "@/app/api/creations/availability/route";
import { GET as related } from "@/app/api/creations/related/route";
import { DELETE as deleteCreation, GET as getCreation, PATCH as patchCreation } from "@/app/api/creations/[id]/route";
import { POST as createCreation } from "@/app/api/creations/route";
import { POST as reorder } from "@/app/api/creations/reorder/route";
import { PATCH as patchProfile } from "@/app/api/account/profile/route";
import { PATCH as patchPreferences } from "@/app/api/account/preferences/route";
import { PATCH as patchPassword } from "@/app/api/account/password/route";
import { GET as myReservations } from "@/app/api/account/reservations/route";
import { PATCH as cancelReservation } from "@/app/api/account/reservations/[id]/cancel/route";
import { POST as checkout } from "@/app/api/stripe/create-checkout-session/route";
import { GET as verifySession } from "@/app/api/stripe/verify-session/route";
import { POST as generateDescription } from "@/app/api/generate-description/route";
import { POST as saveSettings } from "@/app/api/settings/route";
import { POST as cloudinaryCleanup } from "@/app/api/admin/cloudinary-cleanup/route";
import { GET as listContacts } from "@/app/api/admin/contact/route";
import { DELETE as deleteContact, PATCH as patchContact } from "@/app/api/admin/contact/[id]/route";
import { GET as listReservations, POST as createReservation } from "@/app/api/admin/reservations/route";
import {
  DELETE as deleteReservation,
  PATCH as patchReservation,
} from "@/app/api/admin/reservations/[id]/route";
import { GET as shippingLabel } from "@/app/api/admin/reservations/[id]/shipping-label/route";
import { POST as createUser } from "@/app/api/admin/users/route";
import { DELETE as deleteUser, PATCH as patchUser } from "@/app/api/admin/users/[id]/route";
import { DELETE as deleteBrand, POST as saveBrand } from "@/app/api/admin/yarn-brands/manage/route";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));
vi.mock("@/lib/sendEmail", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripeInstance: vi.fn() }));
vi.mock("@/lib/gemini", () => ({ generateProductDescription: vi.fn() }));
vi.mock("@/lib/cloudinary", () => ({ cloudinary: { uploader: { destroy: vi.fn() } } }));

/**
 * Validation des entrées (docs/SECURITY.md, A03) : pour chaque route d'API qui reçoit un
 * body ou des paramètres, une entrée valide passe, une entrée invalide est refusée (400,
 * champ nommé) et une injection d'opérateur MongoDB (`{"$ne": null}`) est refusée sans
 * rien modifier en base.
 */

const CLIENT = "client@example.com";
const OPERATOR = { $ne: null };
const OPERATOR_TEXT = JSON.stringify(OPERATOR);
const STRONG_PASSWORD = "une phrase de passe solide";
const RESET_TOKEN = "a".repeat(64);

type Ctx = Record<string, any>;

type RouteCase = {
  route: string;
  /** Session et données nécessaires ; renvoie le contexte passé aux appels. */
  setup?: () => Promise<Ctx>;
  call: (ctx: Ctx, input: any) => Promise<Response>;
  valid: { input: (ctx: Ctx) => any; status: number };
  invalid: { input: (ctx: Ctx) => any; champ: string; status?: number };
  /** Injection d'opérateur : refusée (400 et champ nommé) ou ignorée (statut et body donnés). */
  injection: { input: (ctx: Ctx) => any; champ?: string; status?: number; body?: unknown };
  /** Fait échouer la base pendant l'appel valide : 500, sans le message interne. */
  failure?: () => void;
};

const PANNE = "panne simulée de la base";
/** La méthode du modèle échoue à son prochain appel (promesse rejetée ou exception). */
const breaks = (model: any, method: string) => () => {
  vi.spyOn(model, method).mockImplementationOnce(() => {
    throw new Error(PANNE);
  });
};

const json = (path: string, method: string, body: unknown) => makeRequest(path, { method, body });
const id = () => new mongoose.Types.ObjectId().toString();

const clientUser = (extra: Record<string, unknown> = {}) =>
  User.create({ email: CLIENT, provider: "credentials", name: "Alice", ...extra });
const creation = (extra: Record<string, unknown> = {}) =>
  Creation.create({ title: "Bonnet", price: 30, color: "Bleu", type: "bonnet", hidden: false, ...extra });

const asClient = async () => {
  const user = await clientUser();
  asUser(CLIENT, { id: user.id });
  return { user };
};

const contactBody = (extra: Record<string, unknown> = {}) => ({
  name: "Alice",
  email: "visiteur@example.com",
  subject: "Question",
  message: "Bonjour, ce bonnet existe-t-il en rouge ?",
  ...extra,
});
const creationBody = (extra: Record<string, unknown> = {}) => ({
  title: "Bonnet",
  type: "bonnet",
  color: "Bleu",
  price: 30,
  ...extra,
});
const descriptionBody = (extra: Record<string, unknown> = {}) => ({
  type: "bonnet",
  color: "bleu",
  material: "laine",
  price: 30,
  ...extra,
});

const ROUTES: RouteCase[] = [
  // ─── Routes publiques ───────────────────────────────────────────────────────────────
  {
    route: "POST /api/register",
    failure: breaks(User, "findOne"),
    call: (_, body) => register(json("/api/register", "POST", body)),
    valid: { input: () => ({ email: "nouveau@example.com", password: STRONG_PASSWORD }), status: 200 },
    invalid: { input: () => ({ email: "pas-un-email", password: STRONG_PASSWORD }), champ: "email" },
    injection: { input: () => ({ email: OPERATOR, password: STRONG_PASSWORD }), champ: "email" },
  },
  {
    route: "POST /api/auth/forgot-password",
    failure: breaks(User, "findOne"),
    call: (_, body) => forgotPassword(json("/api/auth/forgot-password", "POST", body)),
    valid: { input: () => ({ email: "inconnu@example.com" }), status: 200 },
    invalid: { input: () => ({ email: 42 }), champ: "email" },
    injection: { input: () => ({ email: OPERATOR }), champ: "email" },
  },
  {
    route: "POST /api/auth/reset-password",
    failure: breaks(User, "findOne"),
    setup: async () => {
      await clientUser({
        resetToken: crypto.createHash("sha256").update(RESET_TOKEN).digest("hex"),
        resetTokenExpiry: new Date(Date.now() + 3_600_000),
      });
      return {};
    },
    call: (_, body) => resetPassword(json("/api/auth/reset-password", "POST", body)),
    valid: { input: () => ({ token: RESET_TOKEN, password: STRONG_PASSWORD }), status: 200 },
    invalid: { input: () => ({ token: "court", password: STRONG_PASSWORD }), champ: "token" },
    injection: { input: () => ({ token: OPERATOR, password: STRONG_PASSWORD }), champ: "token" },
  },
  {
    route: "POST /api/contact",
    failure: breaks(Contact, "create"),
    setup: async () => {
      asUser(CLIENT);
      return {};
    },
    call: (_, body) => contact(json("/api/contact", "POST", body)),
    valid: { input: () => contactBody(), status: 201 },
    invalid: { input: () => contactBody({ message: "" }), champ: "message" },
    injection: { input: () => contactBody({ creationId: OPERATOR }), champ: "creationId" },
  },
  {
    route: "GET /api/creations/availability",
    setup: async () => ({ creation: await creation() }),
    call: (_, query) => availability(makeRequest(`/api/creations/availability${query}`)),
    valid: { input: (ctx) => `?ids=${ctx.creation.id}`, status: 200 },
    invalid: { input: () => `?ids=${"x".repeat(3000)}`, champ: "ids" },
    // Paramètre d'URL : toujours une chaîne ; une entrée qui n'est pas un id est ignorée
    injection: { input: () => `?ids=${encodeURIComponent(OPERATOR_TEXT)}`, status: 200, body: { available: [] } },
  },
  {
    route: "GET /api/creations/related",
    setup: async () => ({ creation: await creation() }),
    call: (_, query) => related(makeRequest(`/api/creations/related${query}`)),
    valid: { input: (ctx) => `?ids=${ctx.creation.id}`, status: 200 },
    invalid: { input: () => `?ids=${"x".repeat(3000)}`, champ: "ids" },
    injection: { input: () => `?ids=${encodeURIComponent(OPERATOR_TEXT)}`, status: 200, body: [] },
  },
  {
    route: "GET /api/creations/[id]",
    setup: async () => ({ creation: await creation({ slug: "bonnet" }) }),
    call: (_, ref) => getCreation(makeRequest(`/api/creations/${ref}`), routeParams({ id: ref })),
    valid: { input: () => "bonnet", status: 200 },
    // Identifiant ou slug : un autre format ne désigne aucune création
    invalid: { input: () => "pas un slug", champ: "id", status: 404 },
    injection: { input: () => OPERATOR_TEXT, status: 404 },
  },

  // ─── Compte client ─────────────────────────────────────────────────────────────────
  {
    route: "PATCH /api/account/profile",
    failure: breaks(User, "findOneAndUpdate"),
    setup: asClient,
    call: (_, body) => patchProfile(json("/api/account/profile", "PATCH", body)),
    valid: { input: () => ({ city: "Lyon", postalCode: "69001" }), status: 200 },
    invalid: { input: () => ({ postalCode: "1".repeat(11) }), champ: "postalCode" },
    injection: { input: () => ({ name: OPERATOR }), champ: "name" },
  },
  {
    route: "PATCH /api/account/preferences",
    failure: breaks(User, "findOneAndUpdate"),
    setup: asClient,
    call: (_, body) => patchPreferences(json("/api/account/preferences", "PATCH", body)),
    valid: { input: () => ({ emailNotifications: false }), status: 200 },
    invalid: { input: () => ({ emailNotifications: "non" }), champ: "emailNotifications" },
    injection: { input: () => ({ emailNotifications: OPERATOR }), champ: "emailNotifications" },
  },
  {
    route: "PATCH /api/account/password",
    failure: breaks(User, "findOne"),
    setup: async () => {
      await User.create({ email: CLIENT, provider: "credentials", password: await bcrypt.hash("ancien mot de passe", 4) });
      asUser(CLIENT);
      return {};
    },
    call: (_, body) => patchPassword(json("/api/account/password", "PATCH", body)),
    valid: { input: () => ({ currentPassword: "ancien mot de passe", newPassword: STRONG_PASSWORD }), status: 200 },
    invalid: { input: () => ({ currentPassword: "", newPassword: STRONG_PASSWORD }), champ: "currentPassword" },
    injection: { input: () => ({ currentPassword: OPERATOR, newPassword: STRONG_PASSWORD }), champ: "currentPassword" },
  },
  {
    route: "GET /api/account/reservations",
    setup: asClient,
    call: (_, query) => myReservations(makeRequest(`/api/account/reservations${query}`)),
    valid: { input: () => "?page=1&status=pending&search=bonnet", status: 200 },
    invalid: { input: () => "?status=perdue", champ: "status" },
    injection: { input: () => `?status=${encodeURIComponent(OPERATOR_TEXT)}`, champ: "status" },
  },
  {
    route: "PATCH /api/account/reservations/[id]/cancel",
    setup: async () => {
      const ctx = await asClient();
      const reservation = await Reservation.create({ name: "Alice", contact: CLIENT, creationId: (await creation()).id });
      return { ...ctx, reservation };
    },
    call: (_, { id: reservationId, body }) =>
      cancelReservation(
        json(`/api/account/reservations/${reservationId}/cancel`, "PATCH", body),
        routeParams({ id: reservationId })
      ),
    valid: { input: (ctx) => ({ id: ctx.reservation.id, body: { reason: "Plus besoin" } }), status: 200 },
    invalid: { input: () => ({ id: "pas-un-id", body: {} }), champ: "id" },
    injection: { input: (ctx) => ({ id: ctx.reservation.id, body: { reason: OPERATOR } }), champ: "reason" },
  },

  // ─── Paiement ──────────────────────────────────────────────────────────────────────
  {
    route: "POST /api/stripe/create-checkout-session",
    setup: async () => {
      const ctx = await asClient();
      installFakeStripe().checkout.sessions.create.mockResolvedValue({ id: "cs_test_new", url: "https://stripe.test/pay" });
      return { ...ctx, creation: await creation() };
    },
    call: (_, body) => checkout(json("/api/stripe/create-checkout-session", "POST", body)),
    valid: { input: (ctx) => ({ items: [{ creationId: ctx.creation.id }], deliveryMode: "shipping" }), status: 200 },
    invalid: { input: () => ({ items: [], deliveryMode: "shipping" }), champ: "items" },
    injection: { input: () => ({ items: [{ creationId: OPERATOR }] }), champ: "items.0.creationId" },
  },
  {
    route: "GET /api/stripe/verify-session",
    setup: async () => {
      const ctx = await asClient();
      installFakeStripe().checkout.sessions.retrieve.mockResolvedValue(paidSession({ customer_email: "autre@example.com" }));
      return ctx;
    },
    call: (_, query) => verifySession(makeRequest(`/api/stripe/verify-session${query}`)),
    // Entrée valide : la session est lue chez Stripe, puis refusée car elle n'est pas à ce client
    valid: { input: () => "?session_id=cs_test_1", status: 403 },
    invalid: { input: () => "?session_id=pas-une-session", champ: "session_id" },
    injection: { input: () => `?session_id=${encodeURIComponent(OPERATOR_TEXT)}`, champ: "session_id" },
  },

  // ─── Administration ────────────────────────────────────────────────────────────────
  {
    route: "POST /api/creations",
    failure: breaks(Creation, "findOne"),
    setup: async () => (asAdmin(), {}),
    call: (_, body) => createCreation(json("/api/creations", "POST", body)),
    valid: { input: () => creationBody(), status: 201 },
    invalid: { input: () => creationBody({ price: 0 }), champ: "price" },
    injection: { input: () => creationBody({ relatedCreations: [OPERATOR] }), champ: "relatedCreations.0" },
  },
  {
    route: "PATCH /api/creations/[id]",
    failure: breaks(Creation, "updateOne"),
    setup: async () => (asAdmin(), { creation: await creation() }),
    call: (ctx, body) =>
      patchCreation(json(`/api/creations/${ctx.creation.id}`, "PATCH", body), routeParams({ id: ctx.creation.id })),
    valid: { input: () => ({ hidden: true, title: "Bonnet rouge" }), status: 200 },
    invalid: { input: () => ({ title: "  " }), champ: "title" },
    injection: { input: () => ({ relatedCreations: [OPERATOR] }), champ: "relatedCreations.0" },
  },
  {
    route: "DELETE /api/creations/[id]",
    setup: async () => (asAdmin(), { creation: await creation() }),
    call: (_, creationId) => deleteCreation(makeRequest(`/api/creations/${creationId}`, { method: "DELETE" }), routeParams({ id: creationId })),
    valid: { input: (ctx) => ctx.creation.id, status: 204 },
    invalid: { input: () => "pas-un-id", champ: "id" },
    injection: { input: () => OPERATOR_TEXT, champ: "id" },
  },
  {
    route: "POST /api/creations/reorder",
    failure: breaks(Creation, "bulkWrite"),
    setup: async () => (asAdmin(), { creation: await creation() }),
    call: (_, body) => reorder(json("/api/creations/reorder", "POST", body)),
    valid: { input: (ctx) => ({ orderedIds: [ctx.creation.id] }), status: 200 },
    invalid: { input: () => ({ orderedIds: "a,b" }), champ: "orderedIds" },
    // bulkWrite n'est pas couvert par sanitizeFilter : seul le schéma bloque cette injection
    injection: { input: () => ({ orderedIds: [OPERATOR] }), champ: "orderedIds.0" },
  },
  {
    route: "POST /api/generate-description",
    setup: async () => {
      asAdmin();
      vi.mocked(generateProductDescription).mockResolvedValue("Un joli bonnet.");
      return {};
    },
    call: (_, body) => generateDescription(json("/api/generate-description", "POST", body)),
    valid: { input: () => descriptionBody({ price: "30" }), status: 200 },
    invalid: { input: () => descriptionBody({ type: "" }), champ: "type" },
    injection: { input: () => descriptionBody({ material: OPERATOR }), champ: "material" },
  },
  {
    route: "POST /api/settings",
    failure: breaks(Settings, "findByIdAndUpdate"),
    setup: async () => (asAdmin(), {}),
    call: (_, body) => saveSettings(json("/api/settings", "POST", body)),
    valid: { input: () => ({ _id: "main", title: "Boutique", shippingCost: 6 }), status: 200 },
    invalid: { input: () => ({ shippingCost: -1 }), champ: "shippingCost" },
    injection: { input: () => ({ title: OPERATOR }), champ: "title" },
  },
  {
    route: "POST /api/admin/cloudinary-cleanup",
    setup: async () => (asAdmin(), {}),
    call: (_, body) => cloudinaryCleanup(json("/api/admin/cloudinary-cleanup", "POST", body)),
    valid: { input: () => ({ publicIds: ["maillemum/abandonnee"] }), status: 200 },
    invalid: { input: () => ({ publicIds: "maillemum/abandonnee" }), champ: "publicIds" },
    injection: { input: () => ({ publicIds: [OPERATOR] }), champ: "publicIds.0" },
  },
  {
    route: "GET /api/admin/contact",
    setup: async () => (asAdmin(), {}),
    call: (_, query) => listContacts(makeRequest(`/api/admin/contact${query}`)),
    valid: { input: () => "?status=new", status: 200 },
    invalid: { input: () => "?status=supprime", champ: "status" },
    injection: { input: () => `?status=${encodeURIComponent(OPERATOR_TEXT)}`, champ: "status" },
  },
  {
    route: "PATCH /api/admin/contact/[id]",
    failure: breaks(Contact, "findByIdAndUpdate"),
    setup: async () => {
      asAdmin();
      return { message: await Contact.create(contactBody()) };
    },
    call: (ctx, body) =>
      patchContact(json(`/api/admin/contact/${ctx.message.id}`, "PATCH", body), { params: Promise.resolve({ id: ctx.message.id }) }),
    valid: { input: () => ({ status: "read" }), status: 200 },
    invalid: { input: () => ({ status: "supprime" }), champ: "status" },
    injection: { input: () => ({ status: OPERATOR }), champ: "status" },
  },
  {
    route: "DELETE /api/admin/contact/[id]",
    failure: breaks(Contact, "findByIdAndDelete"),
    setup: async () => {
      asAdmin();
      return { message: await Contact.create(contactBody()) };
    },
    call: (_, messageId) =>
      deleteContact(makeRequest(`/api/admin/contact/${messageId}`, { method: "DELETE" }), { params: Promise.resolve({ id: messageId }) }),
    valid: { input: (ctx) => ctx.message.id, status: 204 },
    invalid: { input: () => "pas-un-id", champ: "id" },
    injection: { input: () => OPERATOR_TEXT, champ: "id" },
  },
  {
    route: "GET /api/admin/reservations",
    setup: async () => (asAdmin(), {}),
    call: (_, query) => listReservations(makeRequest(`/api/admin/reservations${query}`)),
    valid: { input: () => `?page=2&limit=5&status=shipped&creationId=${id()}&search=alice`, status: 200 },
    invalid: { input: () => "?creationId=pas-un-id", champ: "creationId" },
    injection: { input: () => `?status=${encodeURIComponent(OPERATOR_TEXT)}`, champ: "status" },
  },
  {
    route: "POST /api/admin/reservations",
    failure: breaks(User, "findById"),
    setup: async () => {
      asAdmin();
      return { user: await clientUser(), creation: await creation() };
    },
    call: (_, body) => createReservation(json("/api/admin/reservations", "POST", body)),
    valid: { input: (ctx) => ({ userId: ctx.user.id, creationIds: [ctx.creation.id] }), status: 201 },
    invalid: { input: (ctx) => ({ userId: ctx.user.id, creationIds: [] }), champ: "creationIds" },
    injection: { input: (ctx) => ({ userId: OPERATOR, creationIds: [ctx.creation.id] }), champ: "userId" },
  },
  {
    route: "PATCH /api/admin/reservations/[id]",
    failure: breaks(Reservation, "findById"),
    setup: async () => {
      asAdmin();
      return { reservation: await Reservation.create({ name: "Alice", contact: CLIENT }) };
    },
    call: (ctx, body) =>
      patchReservation(json(`/api/admin/reservations/${ctx.reservation.id}`, "PATCH", body), {
        params: Promise.resolve({ id: ctx.reservation.id }),
      }),
    valid: { input: () => ({ seenByAdmin: true, trackingNumber: "6A123" }), status: 200 },
    invalid: { input: () => ({ status: "perdue" }), champ: "status" },
    injection: { input: () => ({ contact: OPERATOR }), champ: "contact" },
  },
  {
    route: "DELETE /api/admin/reservations/[id]",
    failure: breaks(Reservation, "findById"),
    setup: async () => {
      asAdmin();
      return { reservation: await Reservation.create({ name: "Alice", contact: CLIENT }) };
    },
    call: (_, { id: reservationId, query }) =>
      deleteReservation(makeRequest(`/api/admin/reservations/${reservationId}${query}`, { method: "DELETE" }), {
        params: Promise.resolve({ id: reservationId }),
      }),
    valid: { input: (ctx) => ({ id: ctx.reservation.id, query: "?wholeOrder=1" }), status: 204 },
    invalid: { input: (ctx) => ({ id: ctx.reservation.id, query: `?wholeOrder=${"1".repeat(10)}` }), champ: "wholeOrder" },
    injection: { input: () => ({ id: OPERATOR_TEXT, query: "" }), champ: "id" },
  },
  {
    route: "GET /api/admin/reservations/[id]/shipping-label",
    setup: async () => {
      asAdmin();
      return { reservation: await Reservation.create({ name: "Alice", contact: CLIENT, deliveryMode: "shipping" }) };
    },
    call: (_, reservationId) =>
      shippingLabel(makeRequest(`/api/admin/reservations/${reservationId}/shipping-label`), {
        params: Promise.resolve({ id: reservationId }),
      }),
    valid: { input: (ctx) => ctx.reservation.id, status: 200 },
    invalid: { input: () => "pas-un-id", champ: "id" },
    injection: { input: () => OPERATOR_TEXT, champ: "id" },
  },
  {
    route: "POST /api/admin/users",
    failure: breaks(User, "findOne"),
    setup: async () => (asAdmin(), {}),
    call: (_, body) => createUser(json("/api/admin/users", "POST", body)),
    valid: { input: () => ({ email: "Nouveau@Example.com", name: null, role: "user" }), status: 201 },
    invalid: { input: () => ({ email: "nouveau@example.com", role: "superadmin" }), champ: "role" },
    // Audit A03 : cet email partait tel quel dans User.findOne
    injection: { input: () => ({ email: OPERATOR }), champ: "email" },
  },
  {
    route: "PATCH /api/admin/users/[id]",
    setup: async () => {
      asAdmin();
      return { user: await clientUser() };
    },
    call: (ctx, body) => patchUser(json(`/api/admin/users/${ctx.user.id}`, "PATCH", body), routeParams({ id: ctx.user.id })),
    valid: { input: () => ({ name: "Alice Martin", phone: null, emailNotifications: false }), status: 200 },
    invalid: { input: () => ({ email: "pas-un-email" }), champ: "email" },
    injection: { input: () => ({ email: OPERATOR }), champ: "email" },
  },
  {
    route: "DELETE /api/admin/users/[id]",
    setup: async () => {
      asAdmin();
      return { user: await clientUser() };
    },
    call: (_, userId) => deleteUser(makeRequest(`/api/admin/users/${userId}`, { method: "DELETE" }), routeParams({ id: userId })),
    valid: { input: (ctx) => ctx.user.id, status: 200 },
    invalid: { input: () => "pas-un-id", champ: "id" },
    injection: { input: () => OPERATOR_TEXT, champ: "id" },
  },
  {
    route: "POST /api/admin/yarn-brands/manage",
    failure: breaks(YarnBrand, "findOne"),
    setup: async () => (asAdmin(), {}),
    call: (_, body) => saveBrand(json("/api/admin/yarn-brands/manage", "POST", body)),
    valid: { input: () => ({ brand: " Phildar ", pricePerHundredGrams: 5 }), status: 200 },
    invalid: { input: () => ({ brand: "Phildar", pricePerHundredGrams: 0 }), champ: "pricePerHundredGrams" },
    injection: { input: () => ({ brand: OPERATOR, pricePerHundredGrams: 5 }), champ: "brand" },
  },
  {
    route: "DELETE /api/admin/yarn-brands/manage",
    setup: async () => {
      asAdmin();
      return { brand: await YarnBrand.create({ brand: "Phildar", pricePerHundredGrams: 5 }) };
    },
    call: (_, query) => deleteBrand(makeRequest(`/api/admin/yarn-brands/manage${query}`, { method: "DELETE" })),
    valid: { input: (ctx) => `?id=${ctx.brand.id}`, status: 200 },
    invalid: { input: () => "?id=pas-un-id", champ: "id" },
    injection: { input: () => `?id=${encodeURIComponent(OPERATOR_TEXT)}`, champ: "id" },
  },
];

/** Contenu de toutes les collections (sauf les compteurs de limite de débit). */
async function databaseSnapshot() {
  const collections = await mongoose.connection.db!.collections();
  const entries = await Promise.all(
    collections
      .filter((c) => c.collectionName !== "ratelimits")
      .map(async (c) => [c.collectionName, await c.find().sort({ _id: 1 }).toArray()] as const)
  );
  return JSON.stringify(entries.sort(([a], [b]) => a.localeCompare(b)));
}

beforeEach(async () => {
  await connectToDatabase();
  vi.mocked(sendEmail).mockResolvedValue({ data: { id: "email" }, error: null } as any);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe.each(ROUTES)("$route", ({ setup, call, valid, invalid, injection }) => {
  it("accepte une entrée valide", async () => {
    const ctx = (await setup?.()) ?? {};
    const res = await call(ctx, valid.input(ctx));
    expect(res.status).toBe(valid.status);
  });

  it("refuse une entrée invalide en nommant le champ", async () => {
    const ctx = (await setup?.()) ?? {};
    const res = await call(ctx, invalid.input(ctx));
    const status = invalid.status ?? 400;
    expect(res.status).toBe(status);
    if (status === 400) {
      const body = await res.json();
      expect(body.champ).toBe(invalid.champ);
      expect(body.error).toMatch(/\S/);
    }
  });

  it('refuse une injection d\'opérateur {"$ne": null} sans rien modifier en base', async () => {
    const ctx = (await setup?.()) ?? {};
    const before = await databaseSnapshot();
    const res = await call(ctx, injection.input(ctx));

    if (injection.body !== undefined || injection.status !== undefined) {
      expect(res.status).toBe(injection.status);
      if (injection.body !== undefined) expect(await res.json()).toEqual(injection.body);
    } else {
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.champ).toBe(injection.champ);
      // Message générique : ni la valeur reçue ni le détail de l'erreur zod
      expect(body.error).not.toMatch(/\$ne|object|expected|received/i);
    }
    expect(await databaseSnapshot()).toBe(before);
  });
});

describe.each(ROUTES.filter((r) => r.failure))("$route — panne de la base", ({ setup, call, valid, failure }) => {
  it("répond 500 sans détail interne", async () => {
    const ctx = (await setup?.()) ?? {};
    vi.spyOn(console, "error").mockImplementation(() => {});
    failure!();
    const res = await call(ctx, valid.input(ctx));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain(PANNE);
  });
});
