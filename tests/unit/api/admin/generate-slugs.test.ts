import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/generate-slugs/route";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import { readJson } from "../../../helpers/http";
import { asAdmin } from "../../../helpers/session";
import { createCreation, expectAdminOnly } from "../../../helpers/admin-fixtures";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));

describe("POST /api/admin/generate-slugs", () => {
  beforeEach(async () => {
    await connectToDatabase();
  });

  it("est réservé aux admins", async () => {
    await expectAdminOnly(() => POST());
  });

  it("génère un slug unique pour les créations qui n'en ont pas", async () => {
    await createCreation({ title: "Écharpe douce", slug: "echarpe-douce" });
    const sansSlug = await createCreation({ title: "Écharpe douce" });
    const autre = await createCreation({ title: "Bonnet rayé" });
    asAdmin();

    const { status, body } = await readJson(await POST());
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.count).toBe(2);
    expect(body.slugs).toEqual(
      expect.arrayContaining([
        { title: "Écharpe douce", slug: "echarpe-douce-1" },
        { title: "Bonnet rayé", slug: "bonnet-raye" },
      ])
    );
    expect((await Creation.findById(sansSlug._id))!.slug).toBe("echarpe-douce-1");
    expect((await Creation.findById(autre._id))!.slug).toBe("bonnet-raye");
  });

  it("ne fait rien quand toutes les créations ont déjà un slug", async () => {
    await createCreation({ slug: "pull-en-laine" });
    asAdmin();

    const { body } = await readJson(await POST());
    expect(body).toEqual({ success: true, count: 0, slugs: [] });
  });

  it("répond 500 avec le message d'erreur", async () => {
    asAdmin();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Creation, "find").mockRejectedValueOnce(new Error("base indisponible"));

    const { status, body } = await readJson(await POST());
    expect(status).toBe(500);
    expect(body.error).toBe("base indisponible");
  });
});
