import { vi } from "vitest";
import { getServerSession } from "next-auth";

// À utiliser dans un fichier qui déclare :
//   vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));

type Role = "user" | "admin";

export function setSession(user: { email: string; id?: string; name?: string; role?: Role } | null) {
  vi.mocked(getServerSession).mockResolvedValue(
    user ? { user: { role: "user", ...user }, expires: "2999-01-01T00:00:00.000Z" } : null
  );
}

export const asAnonymous = () => setSession(null);
export const asUser = (email = "client@example.com", extra: { id?: string; name?: string } = {}) =>
  setSession({ email, role: "user", ...extra });
export const asAdmin = (email = "admin@example.com", extra: { id?: string; name?: string } = {}) =>
  setSession({ email, role: "admin", ...extra });
