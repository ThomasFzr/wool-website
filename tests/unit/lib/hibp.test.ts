import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// tests/setup.ts remplace lib/hibp par un faux : on teste ici le code réel.
const { pwnedCount } = await vi.importActual<typeof import("@/lib/hibp")>("@/lib/hibp");

const PASSWORD = "correct horse battery staple";
const SHA1 = crypto.createHash("sha1").update(PASSWORD).digest("hex").toUpperCase();
const PREFIX = SHA1.slice(0, 5);
const SUFFIX = SHA1.slice(5);

const reply = (body: string, status = 200) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { status }));

describe("pwnedCount (Have I Been Pwned, k-anonymity)", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("n'envoie que les 5 premiers caractères du SHA-1, avec le padding demandé", async () => {
    const fetchSpy = reply("");
    await pwnedCount(PASSWORD);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`);
    expect(url).not.toContain(SUFFIX);
    expect(init.headers).toEqual({ "Add-Padding": "true" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("utilise HIBP_API_BASE_URL quand elle est définie (faux serveur des e2e)", async () => {
    vi.stubEnv("HIBP_API_BASE_URL", "http://localhost:3102");
    const fetchSpy = reply("");
    await pwnedCount(PASSWORD);
    expect(fetchSpy.mock.calls[0][0]).toBe(`http://localhost:3102/range/${PREFIX}`);
  });

  it("renvoie le nombre d'apparitions quand le suffixe figure dans la réponse", async () => {
    reply(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${SUFFIX}:3861493\r\nFFFFF00000000000000000000000000000:0`);
    expect(await pwnedCount(PASSWORD)).toBe(3861493);
  });

  it("renvoie 0 quand le suffixe est absent", async () => {
    reply("0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n");
    expect(await pwnedCount(PASSWORD)).toBe(0);
  });

  it("renvoie 0 pour une ligne de padding (compte nul ou illisible)", async () => {
    reply(`${SUFFIX}:0`);
    expect(await pwnedCount(PASSWORD)).toBe(0);
    reply(`${SUFFIX}:`);
    expect(await pwnedCount(PASSWORD)).toBe(0);
  });

  it("renvoie null si l'API répond en erreur", async () => {
    reply("Service Unavailable", 503);
    expect(await pwnedCount(PASSWORD)).toBeNull();
    expect(console.warn).toHaveBeenCalledWith("[hibp] Réponse 503, mot de passe non vérifié");
  });

  it("renvoie null si l'API est injoignable ou trop lente, sans journaliser le mot de passe", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    expect(await pwnedCount(PASSWORD)).toBeNull();
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(PASSWORD);
  });
});
