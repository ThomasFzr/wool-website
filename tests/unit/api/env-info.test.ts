import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/env-info/route";
import { readJson } from "../../helpers/http";
import { asAdmin, asAnonymous, asUser } from "../../helpers/session";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));

const get = async () => readJson(await GET());

describe("GET /api/env-info", () => {
  it("se cache derrière un 404 en production pour un visiteur", async () => {
    vi.stubEnv("NODE_ENV", "production");
    asAnonymous();
    const { status, body } = await get();
    expect(status).toBe(404);
    expect(body).toEqual({ error: "Not found" });
  });

  it("se cache aussi en production pour un utilisateur non admin", async () => {
    vi.stubEnv("NODE_ENV", "production");
    asUser();
    expect((await get()).status).toBe(404);
  });

  it("répond à l'admin en production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MONGODB_URI", "mongodb+srv://u:p@cluster.mongodb.net/prod?retryWrites=true");
    asAdmin();
    expect(await get()).toEqual({
      status: 200,
      body: { isLocalDb: false, dbName: "prod", nodeEnv: "production" },
    });
  });

  it.each([
    ["mongodb://localhost:27017/wool?x=1", true, "wool"],
    ["mongodb://127.0.0.1:27017/dev", true, "dev"],
    ["mongodb://localhost:27017", true, "localhost"],
    ["mongodb+srv://u:p@cluster.mongodb.net", false, null],
    ["mongodb://db.example.com:27017/x", false, null],
    ["", false, null],
  ])("analyse l'URI %s hors production sans contrôle d'accès", async (uri, isLocalDb, dbName) => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MONGODB_URI", uri);
    asAnonymous();
    expect(await get()).toEqual({ status: 200, body: { isLocalDb, dbName, nodeEnv: "development" } });
  });
});
