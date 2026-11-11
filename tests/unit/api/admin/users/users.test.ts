import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { GET, POST } from "@/app/api/admin/users/route";
import { DELETE, PATCH } from "@/app/api/admin/users/[id]/route";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { makeRequest, readJson, routeParams } from "../../../../helpers/http";
import { asAdmin } from "../../../../helpers/session";
import { createUser, expectAdminOnly, failSession } from "../../../../helpers/admin-fixtures";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));

const list = () => GET(makeRequest("/api/admin/users"));
const create = (body: unknown) => POST(makeRequest("/api/admin/users", { method: "POST", body }));
const patch = (id: string, body: unknown) =>
  PATCH(makeRequest(`/api/admin/users/${id}`, { method: "PATCH", body }), routeParams({ id }));
const del = (id: string) =>
  DELETE(makeRequest(`/api/admin/users/${id}`, { method: "DELETE" }), routeParams({ id }));
const unknownId = () => new mongoose.Types.ObjectId().toString();
const withSecrets = (email: string) => User.findOne({ email }).select("+password +resetToken");

beforeEach(async () => {
  await connectToDatabase();
});

describe("GET /api/admin/users", () => {
  it("est réservé aux admins", async () => {
    await expectAdminOnly(() => list());
  });

  it("liste les utilisateurs du plus récent au plus ancien, sans champs sensibles", async () => {
    await createUser({ email: "ancien@example.com", password: "hash", resetToken: "jeton", createdAt: new Date("2024-01-01") });
    await createUser({ email: "recent@example.com" });
    asAdmin();

    const { status, body } = await readJson(await list());
    expect(status).toBe(200);
    expect(body.map((u: any) => u.email)).toEqual(["recent@example.com", "ancien@example.com"]);
    expect(body[1]).not.toHaveProperty("password");
    expect(body[1]).not.toHaveProperty("resetToken");
  });

  it("répond 500 en cas d'erreur", async () => {
    failSession();
    expect((await list()).status).toBe(500);
  });
});

describe("POST /api/admin/users", () => {
  it("est réservé aux admins", async () => {
    await expectAdminOnly(() => create({}));
  });

  it("exige un email", async () => {
    asAdmin();
    const { status, body } = await readJson(await create({ name: "Sans email" }));
    expect(status).toBe(400);
    expect(body.error).toBe("L'email est requis");
  });

  it.each([["12345"], [12345678]])("refuse un mot de passe trop court ou non textuel (%j)", async (password) => {
    asAdmin();
    const { status, body } = await readJson(await create({ email: "a@example.com", password }));
    expect(status).toBe(400);
    expect(body.error).toMatch(/6 caractères/);
    expect(await User.countDocuments()).toBe(0);
  });

  it("refuse un email déjà utilisé, quelle que soit la casse", async () => {
    await createUser({ email: "client@example.com" });
    asAdmin();
    const { status, body } = await readJson(await create({ email: "  Client@Example.com " }));
    expect(status).toBe(400);
    expect(body.error).toBe("Cet email est déjà utilisé");
  });

  it("crée un compte sans mot de passe avec les valeurs par défaut", async () => {
    asAdmin();
    const { status, body } = await readJson(await create({ email: "Nouveau@Example.com" }));
    expect(status).toBe(201);
    expect(body).toMatchObject({
      email: "nouveau@example.com",
      name: null,
      role: "user",
      provider: "admin-created",
      phone: null,
      address: null,
      city: null,
      postalCode: null,
      emailNotifications: true,
    });
    expect(body).not.toHaveProperty("password");
    expect((await withSecrets("nouveau@example.com"))!.password).toBeUndefined();
  });

  it("crée un compte complet avec mot de passe haché", async () => {
    asAdmin();
    const { status, body } = await readJson(
      await create({
        email: "admin2@example.com",
        name: "Admin Deux",
        role: "admin",
        password: "secret123",
        phone: "0600000000",
        address: "1 rue de la Laine",
        city: "Lyon",
        postalCode: "69001",
        emailNotifications: false,
      })
    );
    expect(status).toBe(201);
    expect(body).toMatchObject({
      name: "Admin Deux",
      role: "admin",
      provider: "credentials",
      phone: "0600000000",
      address: "1 rue de la Laine",
      city: "Lyon",
      postalCode: "69001",
      emailNotifications: false,
    });
    const stored = await withSecrets("admin2@example.com");
    expect(await bcrypt.compare("secret123", stored!.password!)).toBe(true);
  });

  it("répond 500 sur un corps JSON invalide", async () => {
    asAdmin();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await create("{pas du json")).status).toBe(500);
  });
});

describe("PATCH /api/admin/users/[id]", () => {
  it("est réservé aux admins", async () => {
    const user = await createUser();
    await expectAdminOnly(() => patch(user.id, { name: "X" }));
  });

  it("répond 404 pour un utilisateur inexistant", async () => {
    asAdmin();
    const { status, body } = await readJson(await patch(unknownId(), { name: "X" }));
    expect(status).toBe(404);
    expect(body.error).toBe("Utilisateur non trouvé");
  });

  it("refuse un email déjà utilisé par un autre compte", async () => {
    const user = await createUser();
    await createUser({ email: "autre@example.com" });
    asAdmin();
    const { status, body } = await readJson(await patch(user.id, { email: "autre@example.com" }));
    expect(status).toBe(400);
    expect(body.error).toBe("Cet email est déjà utilisé");
  });

  it("refuse son propre email écrit avec une autre casse", async () => {
    // BUG: la comparaison `email !== user.email` est sensible à la casse alors que la
    // recherche Mongo (schéma lowercase) ne l'est pas : l'utilisateur se trouve lui-même.
    const user = await createUser();
    asAdmin();
    const { status, body } = await readJson(await patch(user.id, { email: "Client@Example.com" }));
    expect(status).toBe(400);
    expect(body.error).toBe("Cet email est déjà utilisé");
  });

  it("met à jour les champs fournis et laisse les autres intacts", async () => {
    const user = await createUser({ name: "Avant", city: "Paris", phone: "0102030405" });
    asAdmin();
    const { status, body } = await readJson(
      await patch(user.id, {
        name: "Après",
        email: "nouvelle@example.com",
        role: "admin",
        address: "2 rue du Fil",
        city: null,
        postalCode: "75002",
        emailNotifications: false,
      })
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({
      _id: user.id,
      name: "Après",
      email: "nouvelle@example.com",
      role: "admin",
      provider: "credentials",
      phone: "0102030405",
      address: "2 rue du Fil",
      city: null,
      postalCode: "75002",
      emailNotifications: false,
    });
    expect(body.updatedAt).toBeDefined();
    expect((await User.findById(user.id))!.email).toBe("nouvelle@example.com");
  });

  it("accepte de renvoyer son email actuel sans le considérer comme pris", async () => {
    const user = await createUser({ phone: "01" });
    asAdmin();
    const { status, body } = await readJson(await patch(user.id, { email: "client@example.com", phone: "02" }));
    expect(status).toBe(200);
    expect(body.phone).toBe("02");
  });

  it("n'écrit rien quand le corps est vide", async () => {
    const user = await createUser({ name: "Inchangé" });
    asAdmin();
    const { body } = await readJson(await patch(user.id, {}));
    expect(body).toMatchObject({ name: "Inchangé", role: "user", emailNotifications: true });
  });

  it("accepte un rôle hors liste car les validateurs sont désactivés", async () => {
    // BUG: runValidators: false et aucun contrôle du rôle : un rôle invalide est enregistré.
    const user = await createUser();
    asAdmin();
    const { body } = await readJson(await patch(user.id, { role: "superadmin" }));
    expect(body.role).toBe("superadmin");
  });

  it("refuse un nouveau mot de passe trop court", async () => {
    const user = await createUser({ name: "Avant" });
    asAdmin();
    const { status, body } = await readJson(await patch(user.id, { name: "Après", password: "123" }));
    expect(status).toBe(400);
    expect(body.error).toMatch(/6 caractères/);
    expect((await User.findById(user.id))!.name).toBe("Avant");
  });

  it("refuse un mot de passe non textuel", async () => {
    const user = await createUser();
    asAdmin();
    expect((await patch(user.id, { password: 12345678 })).status).toBe(400);
  });

  it("hache le nouveau mot de passe", async () => {
    const user = await createUser();
    asAdmin();
    const { body } = await readJson(await patch(user.id, { password: "nouveau-secret" }));
    expect(body).not.toHaveProperty("password");
    const stored = await withSecrets("client@example.com");
    expect(await bcrypt.compare("nouveau-secret", stored!.password!)).toBe(true);
  });

  it("répond 500 pour un identifiant invalide", async () => {
    asAdmin();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await patch("pas-un-id", { name: "X" })).status).toBe(500);
  });
});

describe("DELETE /api/admin/users/[id]", () => {
  it("est réservé aux admins", async () => {
    await expectAdminOnly(() => del(unknownId()));
  });

  it("répond 404 pour un utilisateur inexistant", async () => {
    asAdmin();
    expect((await del(unknownId())).status).toBe(404);
  });

  it("empêche l'admin de supprimer son propre compte", async () => {
    const me = await createUser({ email: "admin@example.com", role: "admin" });
    asAdmin("admin@example.com");
    const { status, body } = await readJson(await del(me.id));
    expect(status).toBe(400);
    expect(body.error).toBe("Vous ne pouvez pas supprimer votre propre compte");
    expect(await User.countDocuments()).toBe(1);
  });

  it("supprime un autre utilisateur", async () => {
    const user = await createUser();
    asAdmin();
    const { status, body } = await readJson(await del(user.id));
    expect(status).toBe(200);
    expect(body.message).toBe("Utilisateur supprimé");
    expect(await User.countDocuments()).toBe(0);
  });

  it("répond 500 en cas d'erreur", async () => {
    failSession();
    expect((await del(unknownId())).status).toBe(500);
  });
});
