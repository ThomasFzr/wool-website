import { beforeEach, describe, expect, it, vi } from "vitest";
import { clientIp, hitRateLimit, rateLimitCount } from "@/lib/rate-limit";
import { connectToDatabase } from "@/lib/db";
import RateLimit from "@/models/RateLimit";

const WINDOW = 60_000;
let now = 10 * WINDOW + 5_000;

beforeEach(async () => {
  await connectToDatabase();
  now = 10 * WINDOW + 5_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
});

describe("hitRateLimit / rateLimitCount", () => {
  it("compte les requêtes par clé dans la fenêtre courante", async () => {
    expect(await rateLimitCount("login:ip:1.1.1.1", WINDOW)).toBe(0);
    expect(await hitRateLimit("login:ip:1.1.1.1", WINDOW)).toBe(1);
    expect(await hitRateLimit("login:ip:1.1.1.1", WINDOW)).toBe(2);
    expect(await hitRateLimit("login:ip:2.2.2.2", WINDOW)).toBe(1);
    expect(await rateLimitCount("login:ip:1.1.1.1", WINDOW)).toBe(2);
  });

  it("repart de zéro à la fenêtre suivante, et laisse MongoDB purger l'ancienne", async () => {
    await hitRateLimit("k", WINDOW);
    await hitRateLimit("k", WINDOW);
    const [doc] = await RateLimit.find().lean<{ expiresAt: Date }[]>();
    expect(doc.expiresAt).toEqual(new Date(11 * WINDOW));

    now = 11 * WINDOW;
    expect(await rateLimitCount("k", WINDOW)).toBe(0);
    expect(await hitRateLimit("k", WINDOW)).toBe(1);
  });

  it("compte juste sous des requêtes simultanées", async () => {
    await RateLimit.init();
    const counts = await Promise.all(Array.from({ length: 10 }, () => hitRateLimit("burst", WINDOW)));
    expect(counts.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("laisse passer si la base est indisponible", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(RateLimit, "findOneAndUpdate").mockImplementationOnce(() => {
      throw new Error("db down");
    });
    vi.spyOn(RateLimit, "findById").mockImplementationOnce(() => {
      throw new Error("db down");
    });
    expect(await hitRateLimit("k", WINDOW)).toBe(0);
    expect(await rateLimitCount("k", WINDOW)).toBe(0);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("clientIp", () => {
  it.each([
    ["x-real-ip en priorité", new Headers({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }), "1.1.1.1"],
    ["premier x-forwarded-for", new Headers({ "x-forwarded-for": " 3.3.3.3 , 10.0.0.1" }), "3.3.3.3"],
    ["objet d'en-têtes (next-auth)", { "x-forwarded-for": "4.4.4.4" }, "4.4.4.4"],
    ["valeur multiple", { "x-real-ip": ["5.5.5.5", "6.6.6.6"] }, "5.5.5.5"],
    ["sans en-tête", new Headers(), "unknown"],
    ["en-têtes absents", undefined, "unknown"],
    ["valeur vide", { "x-forwarded-for": " " }, "unknown"],
  ])("%s", (_label, headers, expected) => {
    expect(clientIp(headers)).toBe(expected);
  });
});
