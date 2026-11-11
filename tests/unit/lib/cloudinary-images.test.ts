import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloudinary } from "@/lib/cloudinary";
import { destroyUnusedImages } from "@/lib/cloudinary-images";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";

vi.mock("@/lib/cloudinary", () => ({ cloudinary: { uploader: { destroy: vi.fn() } } }));
const destroy = vi.mocked(cloudinary.uploader.destroy);

describe("destroyUnusedImages", () => {
  beforeEach(async () => {
    await connectToDatabase();
    destroy.mockResolvedValue({ result: "ok" } as any);
  });

  it("ne fait rien sans identifiant exploitable", async () => {
    expect(await destroyUnusedImages([])).toEqual([]);
    expect(await destroyUnusedImages(["", 3, null])).toEqual([]);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("supprime les images inutilisées une seule fois et garde celles d'une création", async () => {
    await Creation.collection.insertOne({ title: "A", imagePublicIds: ["utilisee"] });
    await Creation.collection.insertOne({ title: "Ancienne", imagePublicId: "ancienne" });
    const deleted = await destroyUnusedImages(["orpheline", "utilisee", "ancienne", "orpheline"]);
    expect(deleted).toEqual(["orpheline"]);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledWith("orpheline", { invalidate: true });
  });

  it("journalise un échec Cloudinary sans bloquer les autres suppressions", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    destroy.mockRejectedValueOnce(new Error("cloudinary down"));
    expect(await destroyUnusedImages(["a", "b"])).toEqual(["b"]);
    expect(spy).toHaveBeenCalledWith("Cloudinary destroy error for", "a", expect.any(Error));
  });
});
