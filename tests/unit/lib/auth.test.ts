import { describe, expect, it, vi } from "vitest";
import { getServerSession } from "next-auth";
import { checkAdminAuth } from "@/lib/auth";
import { asAdmin, asAnonymous, asUser } from "../../helpers/session";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));

describe("checkAdminAuth", () => {
  it("renvoie null pour un visiteur non connecté", async () => {
    asAnonymous();
    expect(await checkAdminAuth()).toBeNull();
  });

  it("renvoie null pour une session sans utilisateur", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ expires: "2999-01-01" });
    expect(await checkAdminAuth()).toBeNull();
  });

  it("renvoie null pour un simple client", async () => {
    asUser();
    expect(await checkAdminAuth()).toBeNull();
  });

  it("renvoie la session d'un admin", async () => {
    asAdmin("admin@example.com");
    const session = await checkAdminAuth();
    expect(session?.user).toMatchObject({ email: "admin@example.com", role: "admin" });
  });
});
