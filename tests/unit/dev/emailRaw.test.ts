import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { routeParams } from "../../helpers/http";
import { loadWithTmpOutbox } from "../../helpers/lib-outbox";

type Route = typeof import("@/app/dev/emails/[id]/raw/route");
type Outbox = typeof import("@/lib/emailOutbox");
let GET: Route["GET"];
let captureEmail: Outbox["captureEmail"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const loaded = await loadWithTmpOutbox(async () => ({
    route: await import("@/app/dev/emails/[id]/raw/route"),
    outbox: await import("@/lib/emailOutbox"),
  }));
  GET = loaded.mod.route.GET;
  captureEmail = loaded.mod.outbox.captureEmail;
  cleanup = loaded.cleanup;
});

afterAll(() => cleanup());

const get = (id: string) => GET(new Request(`http://localhost:3000/dev/emails/${id}/raw`), routeParams({ id }));

describe("GET /dev/emails/[id]/raw", () => {
  it("renvoie le HTML brut d'un email capturé, non indexable et non mis en cache", async () => {
    const { id } = await captureEmail({ to: "a@example.com", subject: "Test", html: "<h1>Bonjour</h1>" });
    const res = await get(id);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<h1>Bonjour</h1>");
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("répond 404 pour un email inconnu ou un id invalide", async () => {
    expect((await get("inconnu")).status).toBe(404);
    expect((await get("..%2F..%2Fpackage")).status).toBe(404);
  });

  it("répond 404 en production, même pour un email existant", async () => {
    const { id } = await captureEmail({ to: "a@example.com", subject: "Test", html: "<p>x</p>" });
    vi.stubEnv("NODE_ENV", "production");
    const res = await get(id);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
  });
});
