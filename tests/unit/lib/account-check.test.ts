import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_CHECK_TTL, lookupAccount, resetAccountCheckCache } from "@/lib/account-check";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";

describe("lookupAccount", () => {
  beforeEach(async () => {
    await connectToDatabase();
    resetAccountCheckCache();
  });

  it("lit rôle, id et date de changement de mot de passe ; null pour un compte supprimé", async () => {
    const changed = new Date("2026-11-01T10:00:00Z");
    const u = await User.create({ email: "a@example.com", role: "admin", passwordChangedAt: changed });
    await User.create({ email: "b@example.com" });
    expect((await lookupAccount("a@example.com")).state).toEqual({
      role: "admin",
      userId: u._id.toString(),
      passwordChangedAt: changed.getTime(),
    });
    expect((await lookupAccount("b@example.com")).state).toMatchObject({ role: "user", passwordChangedAt: undefined });
    expect((await lookupAccount("absent@example.com")).state).toBeNull();
  });

  it("garde la lecture ACCOUNT_CHECK_TTL ms, sauf relecture forcée", async () => {
    await User.create({ email: "a@example.com" });
    const spy = vi.spyOn(User, "findOne");
    const now = vi.spyOn(Date, "now");

    now.mockReturnValue(1_000_000);
    const first = await lookupAccount("a@example.com");
    now.mockReturnValue(1_000_000 + ACCOUNT_CHECK_TTL - 1);
    expect(await lookupAccount("a@example.com")).toBe(first);
    expect(spy).toHaveBeenCalledTimes(1);

    await lookupAccount("a@example.com", { fresh: true });
    expect(spy).toHaveBeenCalledTimes(2);

    now.mockReturnValue(1_000_000 + 2 * ACCOUNT_CHECK_TTL);
    expect((await lookupAccount("a@example.com")).checkedAt).toBe(1_000_000 + 2 * ACCOUNT_CHECK_TTL);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(ACCOUNT_CHECK_TTL).toBe(5 * 60 * 1000);
  });

  it("borne la taille du cache (vidé au-delà de 1000 comptes)", async () => {
    const spy = vi.spyOn(User, "findOne").mockReturnValue({ lean: async () => null } as any);
    for (let i = 0; i < 1000; i++) await lookupAccount(`u${i}@example.com`);
    await lookupAccount("u0@example.com");
    expect(spy).toHaveBeenCalledTimes(1000);
    // 1001e compte : le cache est vidé, u0 doit être relu
    await lookupAccount("nouveau@example.com");
    await lookupAccount("u0@example.com");
    expect(spy).toHaveBeenCalledTimes(1002);
  });
});
