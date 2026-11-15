import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);

/** Charge next.config.js avec l'environnement donné (le module lit l'env au chargement). */
async function cspFor(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const path = require.resolve("../../next.config.js");
  delete require.cache[path];
  const config = require(path);
  const rules = await config.headers();
  const { headers } = rules.find((r: { source: string }) => r.source === "/(.*)");
  return headers.find((h: { key: string }) => h.key === "Content-Security-Policy").value as string;
}

describe("Content-Security-Policy (next.config.js)", () => {
  it("restreint les origines en production", async () => {
    const csp = await cspFor({ NODE_ENV: "production", VERCEL_ENV: "production" });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline';");
    expect(csp).toContain("img-src 'self' data: blob: https://res.cloudinary.com https://*.googleusercontent.com");
    expect(csp).toContain("connect-src 'self' https://api.cloudinary.com;");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("vercel.live");
  });

  it("autorise eval en développement (rechargement à chaud)", async () => {
    const csp = await cspFor({ NODE_ENV: "development", VERCEL_ENV: "" });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("autorise la barre d'outils Vercel sur les previews", async () => {
    const csp = await cspFor({ NODE_ENV: "production", VERCEL_ENV: "preview" });
    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://vercel.live");
    expect(csp).toContain("frame-src https://vercel.live");
  });
});

describe("en-têtes (next.config.js)", () => {
  it("interdit l'indexation des fichiers de polices", async () => {
    const path = require.resolve("../../next.config.js");
    delete require.cache[path];
    const rules = await require(path).headers();
    const fonts = rules.find((r: { source: string }) => r.source === "/fonts/:path*");
    expect(fonts.headers).toEqual([{ key: "X-Robots-Tag", value: "noindex, nofollow" }]);
  });
});
