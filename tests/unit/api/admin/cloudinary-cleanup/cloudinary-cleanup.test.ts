import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/cloudinary-cleanup/route";
import { cloudinary } from "@/lib/cloudinary";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import ImageDeletion from "@/models/ImageDeletion";
import { makeRequest, readJson } from "../../../../helpers/http";
import { asAdmin, asUser } from "../../../../helpers/session";
import { expectAdminOnly, failSession } from "../../../../helpers/admin-fixtures";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));
vi.mock("@/lib/cloudinary", () => ({ cloudinary: { uploader: { destroy: vi.fn() } } }));
const destroy = vi.mocked(cloudinary.uploader.destroy);

const post = (body: unknown) =>
  POST(makeRequest("/api/admin/cloudinary-cleanup", { method: "POST", body, headers: { "user-agent": "Tablette" } }));

describe("POST /api/admin/cloudinary-cleanup", () => {
  it("est réservé aux admins", async () => {
    await expectAdminOnly(() => post({ publicIds: [] }));
  });

  it("ne supprime rien pour un non-admin", async () => {
    asUser();
    await post({ publicIds: ["a"] });
    expect(destroy).not.toHaveBeenCalled();
  });

  it("supprime les images abandonnées mais garde celles d'une création", async () => {
    await connectToDatabase();
    await Creation.collection.insertOne({ title: "A", imagePublicIds: ["gardee"] });
    destroy.mockResolvedValue({ result: "ok" } as any);
    asAdmin();
    const { status, body } = await readJson(await post({ publicIds: ["abandonnee", "gardee"] }));
    expect(status).toBe(200);
    expect(body).toEqual({ deleted: ["abandonnee"] });
    // Journal : l'admin et son appareil, pour expliquer une image disparue
    const rows = await ImageDeletion.find().sort({ publicId: 1 }).lean<any[]>();
    expect(rows.map((r) => [r.publicId, r.outcome, r.source, r.by, r.userAgent])).toEqual([
      ["abandonnee", "deleted", "form-cleanup", "admin@example.com", "Tablette"],
      ["gardee", "kept", "form-cleanup", "admin@example.com", "Tablette"],
    ]);
  });

  it("refuse une liste absente ou trop longue", async () => {
    asAdmin();
    for (const body of [{}, { publicIds: "a" }, { publicIds: Array.from({ length: 101 }, (_, i) => `i${i}`) }]) {
      const { status, body: res } = await readJson(await post(body));
      expect(status).toBe(400);
      expect(res.error).toBe("publicIds invalides");
    }
    expect((await post(null)).status).toBe(400);
  });

  it("répond 500 en cas d'erreur", async () => {
    failSession();
    const { status, body } = await readJson(await post({ publicIds: [] }));
    expect(status).toBe(500);
    expect(body.error).toBe("Erreur serveur");
  });
});
