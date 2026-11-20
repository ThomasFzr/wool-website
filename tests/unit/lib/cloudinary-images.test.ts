import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloudinary } from "@/lib/cloudinary";
import { deletionContext, destroyUnusedImages, destroyUnusedLegacyImages } from "@/lib/cloudinary-images";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import ImageDeletion from "@/models/ImageDeletion";

vi.mock("@/lib/cloudinary", () => ({ cloudinary: { uploader: { destroy: vi.fn() } } }));
const destroy = vi.mocked(cloudinary.uploader.destroy);

const context = { source: "form-cleanup" as const, by: "admin@example.com", userAgent: "Tablette" };

/** Journal des suppressions, trié par public_id, sans les champs techniques. */
async function journal() {
  const rows = await ImageDeletion.find().sort({ publicId: 1 }).lean<Record<string, unknown>[]>();
  return rows.map(({ publicId, outcome, source, by, userAgent, creationId, error }) => ({
    publicId,
    outcome,
    source,
    by,
    userAgent,
    creationId: creationId ? String(creationId) : null,
    error,
  }));
}

beforeEach(async () => {
  await connectToDatabase();
  destroy.mockResolvedValue({ result: "ok" } as any);
});

describe("destroyUnusedImages", () => {
  it("ne fait rien sans identifiant exploitable", async () => {
    expect(await destroyUnusedImages([], context)).toEqual([]);
    expect(await destroyUnusedImages(["", 3, null], context)).toEqual([]);
    expect(destroy).not.toHaveBeenCalled();
    expect(await ImageDeletion.countDocuments()).toBe(0);
  });

  it("supprime les images inutilisées une seule fois, garde celles d'une création et journalise tout", async () => {
    await Creation.collection.insertOne({ title: "A", imagePublicIds: ["utilisee"] });
    await Creation.collection.insertOne({ title: "Ancienne", imagePublicId: "ancienne" });
    const deleted = await destroyUnusedImages(["orpheline", "utilisee", "ancienne", "orpheline"], context);
    expect(deleted).toEqual(["orpheline"]);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledWith("orpheline", { invalidate: true });

    const base = { source: "form-cleanup", by: "admin@example.com", userAgent: "Tablette", creationId: null, error: null };
    expect(await journal()).toEqual([
      { ...base, publicId: "ancienne", outcome: "kept" },
      { ...base, publicId: "orpheline", outcome: "deleted" },
      { ...base, publicId: "utilisee", outcome: "kept" },
    ]);
  });

  it("journalise un échec Cloudinary et une image déjà absente, sans bloquer les autres", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    destroy
      .mockRejectedValueOnce(new Error("cloudinary down"))
      .mockResolvedValueOnce({ result: "not found" } as any)
      .mockResolvedValueOnce(undefined as any);
    expect(await destroyUnusedImages(["a", "b", "c"], context)).toEqual(["b", "c"]);
    expect(spy).toHaveBeenCalledWith("Cloudinary destroy error for", "a", expect.any(Error));

    const rows = await journal();
    expect(rows.map((r) => [r.publicId, r.outcome])).toEqual([
      ["a", "error"],
      ["b", "not-found"],
      ["c", "deleted"],
    ]);
    expect(rows[0].error).toBe("Error: cloudinary down");
  });

  it("supprime quand même si le journal est indisponible", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(ImageDeletion, "insertMany").mockRejectedValueOnce(new Error("db down"));
    expect(await destroyUnusedImages(["a"], context)).toEqual(["a"]);
    expect(spy).toHaveBeenCalledWith("Journal des suppressions d'images indisponible:", expect.any(Error));
  });
});

describe("destroyUnusedLegacyImages", () => {
  const url = (name: string) => `https://res.cloudinary.com/demo/image/upload/v1/${name}.jpg`;

  it("ne fait rien sans URL Cloudinary", async () => {
    await destroyUnusedLegacyImages([undefined, null, ""], context);
    await destroyUnusedLegacyImages(["https://ailleurs.example/x.jpg"], context);
    expect(destroy).not.toHaveBeenCalled();
    expect(await ImageDeletion.countDocuments()).toBe(0);
  });

  it("garde les URL encore affichées ailleurs, ignore celles hors Cloudinary et journalise", async () => {
    await Creation.collection.insertOne({ title: "A", images: [url("partagee")] });
    await Creation.collection.insertOne({ title: "B", imageUrl: url("couverture"), images: null });
    await destroyUnusedLegacyImages(
      [url("propre"), url("partagee"), url("couverture"), "https://ailleurs.example/x.jpg", url("propre")],
      context
    );
    expect(destroy.mock.calls.map((call) => call[0])).toEqual(["propre"]);
    expect((await journal()).map((r) => [r.publicId, r.outcome])).toEqual([
      ["couverture", "kept"],
      ["partagee", "kept"],
      ["propre", "deleted"],
    ]);
  });
});

describe("deletionContext", () => {
  const req = (headers: Record<string, string> = {}) => new Request("http://localhost/api", { headers });

  it("reprend l'email de l'admin, l'appareil (tronqué) et la création", () => {
    const ua = "x".repeat(400);
    expect(deletionContext("creation-delete", { user: { email: "a@b.fr" } }, req({ "user-agent": ua }), "id1")).toEqual({
      source: "creation-delete",
      creationId: "id1",
      by: "a@b.fr",
      userAgent: "x".repeat(300),
    });
  });

  it("accepte une session ou un appareil inconnus", () => {
    expect(deletionContext("form-cleanup", null, req())).toEqual({
      source: "form-cleanup",
      creationId: null,
      by: null,
      userAgent: null,
    });
  });
});
