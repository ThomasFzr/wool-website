import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/release-locks/route";
import { releaseStaleLocks } from "@/lib/stale-locks";
import { makeRequest, readJson } from "../../../helpers/http";

vi.mock("@/lib/stale-locks", () => ({ releaseStaleLocks: vi.fn() }));
vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));

const call = (authorization?: string) =>
  GET(makeRequest("/api/cron/release-locks", { headers: authorization ? { authorization } : {} }));

describe("GET /api/cron/release-locks", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "s3cret");
  });

  it("refuse un appel sans le secret du cron", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer autre")).status).toBe(401);
    expect(releaseStaleLocks).not.toHaveBeenCalled();
  });

  it("refuse tout appel quand CRON_SECRET n'est pas configuré", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
  });

  it("libère les verrous expirés et renvoie le bilan", async () => {
    const report = { checked: 1, expired: 1, fulfilled: 0, sold: 0, released: 0 };
    vi.mocked(releaseStaleLocks).mockResolvedValue(report);
    expect(await readJson(await call("Bearer s3cret"))).toEqual({ status: 200, body: report });
  });

  it("répond 500 en cas d'erreur", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(releaseStaleLocks).mockRejectedValue(new Error("db down"));
    expect((await call("Bearer s3cret")).status).toBe(500);
  });
});
