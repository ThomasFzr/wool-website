import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { GET as listContacts } from "@/app/api/admin/contact/route";
import { GET as countContacts } from "@/app/api/admin/contact/count/route";
import { DELETE, PATCH } from "@/app/api/admin/contact/[id]/route";
import { connectToDatabase } from "@/lib/db";
import Contact from "@/models/Contact";
import { makeRequest, readJson, routeParams } from "../../../../helpers/http";
import { asAdmin } from "../../../../helpers/session";
import { createCreation, expectAdminOnly, failSession } from "../../../../helpers/admin-fixtures";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));

const message = (overrides: Record<string, unknown> = {}) =>
  Contact.create({ name: "Alice", email: "alice@example.com", subject: "Question", message: "Bonjour", ...overrides });

const list = (query = "") => listContacts(makeRequest(`/api/admin/contact${query}`));
const patch = (id: string, body: unknown) =>
  PATCH(makeRequest(`/api/admin/contact/${id}`, { method: "PATCH", body }), routeParams({ id }));
const del = (id: string) =>
  DELETE(makeRequest(`/api/admin/contact/${id}`, { method: "DELETE" }), routeParams({ id }));
const unknownId = () => new mongoose.Types.ObjectId().toString();

beforeEach(async () => {
  await connectToDatabase();
});

describe("GET /api/admin/contact", () => {
  it("est réservé aux admins", async () => {
    await expectAdminOnly(() => list());
  });

  it("liste tous les messages du plus récent au plus ancien, avec la création liée", async () => {
    const creation = await createCreation({ title: "Bonnet" });
    await message({ subject: "Ancien", createdAt: new Date("2024-01-01") });
    await message({ subject: "Récent", creationId: creation._id, status: "read" });
    asAdmin();

    const { status, body } = await readJson(await list());
    expect(status).toBe(200);
    expect(body.map((c: any) => c.subject)).toEqual(["Récent", "Ancien"]);
    expect(body[0].creationId.title).toBe("Bonnet");
    expect(body[1].creationId).toBeNull();
  });

  it("filtre par statut", async () => {
    await message({ subject: "Nouveau" });
    await message({ subject: "Archivé", status: "archived" });
    asAdmin();

    const { body } = await readJson(await list("?status=archived"));
    expect(body.map((c: any) => c.subject)).toEqual(["Archivé"]);
  });

  it("ignore le filtre quand le statut vaut « all »", async () => {
    await message();
    await message({ status: "archived" });
    asAdmin();

    const { body } = await readJson(await list("?status=all"));
    expect(body).toHaveLength(2);
  });

  it("répond 500 en cas d'erreur", async () => {
    failSession();
    expect((await list()).status).toBe(500);
  });
});

describe("GET /api/admin/contact/count", () => {
  it("est réservé aux admins", async () => {
    await expectAdminOnly(() => countContacts());
  });

  it("compte les messages non lus", async () => {
    await message();
    await message();
    await message({ status: "read" });
    asAdmin();

    const { status, body } = await readJson(await countContacts());
    expect(status).toBe(200);
    expect(body).toEqual({ new: 2 });
  });

  it("répond 500 en cas d'erreur", async () => {
    failSession();
    expect((await countContacts()).status).toBe(500);
  });
});

describe("PATCH /api/admin/contact/[id]", () => {
  it("est réservé aux admins", async () => {
    const contact = await message();
    await expectAdminOnly(() => patch(contact.id, { status: "read" }));
  });

  it("refuse un statut inconnu", async () => {
    const contact = await message();
    asAdmin();
    const { status, body } = await readJson(await patch(contact.id, { status: "spam" }));
    expect(status).toBe(400);
    expect(body.error).toBe("Statut invalide");
    expect((await Contact.findById(contact.id))!.status).toBe("new");
  });

  it("répond 404 pour un message inexistant", async () => {
    asAdmin();
    expect((await patch(unknownId(), { status: "read" })).status).toBe(404);
  });

  it("met à jour le statut", async () => {
    const contact = await message();
    asAdmin();
    const { status, body } = await readJson(await patch(contact.id, { status: "replied" }));
    expect(status).toBe(200);
    expect(body.status).toBe("replied");
    expect((await Contact.findById(contact.id))!.status).toBe("replied");
  });

  it("répond 500 pour un identifiant invalide", async () => {
    asAdmin();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await patch("pas-un-id", { status: "read" })).status).toBe(500);
  });
});

describe("DELETE /api/admin/contact/[id]", () => {
  it("est réservé aux admins", async () => {
    await expectAdminOnly(() => del(unknownId()));
  });

  it("répond 404 pour un message inexistant", async () => {
    asAdmin();
    expect((await del(unknownId())).status).toBe(404);
  });

  it("supprime le message", async () => {
    const contact = await message();
    asAdmin();
    expect((await del(contact.id)).status).toBe(204);
    expect(await Contact.countDocuments()).toBe(0);
  });

  it("répond 500 en cas d'erreur", async () => {
    failSession();
    expect((await del(unknownId())).status).toBe(500);
  });
});
