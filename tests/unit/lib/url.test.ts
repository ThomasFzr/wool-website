import { describe, expect, it, vi } from "vitest";
import { getAppUrl } from "@/lib/url";

const withHost = (host: string | null, extra: Record<string, string> = {}) => {
  const h = new Headers(extra);
  if (host) h.set("host", host);
  return h;
};

describe("getAppUrl", () => {
  it("retombe sur localhost sans requête ni variable d'environnement", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(getAppUrl()).toBe("http://localhost:3000");
  });

  it("utilise NEXT_PUBLIC_APP_URL sans slash final hors requête", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://maillemum.fr/");
    expect(getAppUrl()).toBe("https://maillemum.fr");
  });

  it("utilise NEXT_PUBLIC_APP_URL quand la requête n'a pas d'en-tête Host", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://maillemum.fr");
    expect(getAppUrl(withHost(null))).toBe("https://maillemum.fr");
  });

  it.each(["localhost:3000", "127.0.0.1:3000"])(
    "accepte l'hôte local %s en http",
    (host) => {
      expect(getAppUrl(withHost(host))).toBe(`http://${host}`);
    }
  );

  it("ne reconnaît pas la boucle locale IPv6 [::1]", () => {
    // BUG: isLocalHost découpe sur le premier ":" ; pour "[::1]:3000" le nom d'hôte obtenu
    // est "[" et la comparaison avec "[::1]" n'aboutit jamais. L'hôte est rejeté et l'URL
    // retombe sur l'environnement au lieu de http://[::1]:3000.
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "");
    expect(getAppUrl(withHost("[::1]:3000"))).toBe("http://localhost:3000");
  });

  it("respecte x-forwarded-proto", () => {
    expect(getAppUrl(withHost("localhost:3000", { "x-forwarded-proto": "https" }))).toBe(
      "https://localhost:3000"
    );
  });

  it("accepte le domaine de NEXT_PUBLIC_APP_URL en https", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://maillemum.fr");
    expect(getAppUrl(withHost("maillemum.fr"))).toBe("https://maillemum.fr");
  });

  it("accepte le domaine de NEXTAUTH_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "https://auth.maillemum.fr");
    expect(getAppUrl(withHost("auth.maillemum.fr"))).toBe("https://auth.maillemum.fr");
  });

  it("accepte VERCEL_PROJECT_PRODUCTION_URL et VERCEL_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "pas une url");
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "prod.example.com");
    vi.stubEnv("VERCEL_URL", "deploy.example.com");
    expect(getAppUrl(withHost("prod.example.com"))).toBe("https://prod.example.com");
    expect(getAppUrl(withHost("deploy.example.com"))).toBe("https://deploy.example.com");
  });

  it("accepte les previews *.vercel.app", () => {
    expect(getAppUrl(withHost("wool-git-tests.vercel.app"))).toBe(
      "https://wool-git-tests.vercel.app"
    );
  });

  it("ignore un en-tête Host falsifié et retombe sur l'environnement", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://maillemum.fr");
    vi.stubEnv("NEXTAUTH_URL", "https://maillemum.fr");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    expect(getAppUrl(withHost("evil.example.com"))).toBe("https://maillemum.fr");
  });
});
