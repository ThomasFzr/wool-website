import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { POST } from "@/app/api/creations/reorder/route";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import { makeRequest, readJson } from "../../../helpers/http";
import { asAdmin, asAnonymous, asUser } from "../../../helpers/session";
import { createCreation } from "../../../helpers/creations-fixtures";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));

const post = (body: unknown) => POST(makeRequest("/api/creations/reorder", { method: "POST", body }));

beforeEach(async () => {
  await connectToDatabase();
});

describe("POST /api/creations/reorder", () => {
  it("refuse un visiteur non connecté", async () => {
    asAnonymous();
    expect((await post({ orderedIds: [] })).status).toBe(401);
  });

  it("refuse un utilisateur non admin", async () => {
    const c = await createCreation({ displayOrder: 3 });
    asUser();
    expect((await post({ orderedIds: [c._id.toString()] })).status).toBe(401);
    expect((await Creation.findById(c._id))!.displayOrder).toBe(3);
  });

  it("répond 400 si orderedIds n'est pas un tableau", async () => {
    asAdmin();
    const res = await post({ orderedIds: "a,b" });
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/array/);
  });

  it("donne le displayOrder le plus élevé au premier élément", async () => {
    const a = await createCreation();
    const b = await createCreation();
    const c = await createCreation();
    asAdmin();

    const { status, body } = await readJson(await post({ orderedIds: [c._id, a._id, b._id].map(String) }));

    expect(status).toBe(200);
    expect(body).toEqual({ success: true });
    expect((await Creation.findById(c._id))!.displayOrder).toBe(3);
    expect((await Creation.findById(a._id))!.displayOrder).toBe(2);
    expect((await Creation.findById(b._id))!.displayOrder).toBe(1);
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("accepte une liste vide sans effet", async () => {
    asAdmin();
    expect((await post({ orderedIds: [] })).status).toBe(200);
  });

  it("répond 500 sur un corps JSON invalide", async () => {
    asAdmin();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post("{oops");
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("DB error");
  });
});
