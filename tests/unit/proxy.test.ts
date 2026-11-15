import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "@/proxy";

const run = (path: string) => proxy(new NextRequest(new URL(path, "http://localhost:3000")));
const passesThrough = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("proxy", () => {
  it.each(["/&", "/&/"])("redirige %s vers l'accueil", (path) => {
    const res = run(path);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("laisse passer les autres pages sans en-tête particulier", () => {
    const res = run("/creations/bonnet-rouge");
    expect(passesThrough(res)).toBe(true);
    expect(res.headers.get("x-robots-tag")).toBeNull();
  });

  it("exclut les fichiers statiques et images du matcher", () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    expect(matcher.test("/creations/bonnet")).toBe(true);
    expect(matcher.test("/_next/static/chunk.js")).toBe(false);
    expect(matcher.test("/images/logo.png")).toBe(false);
    expect(matcher.test("/favicon.ico")).toBe(false);
    // D'où l'en-tête X-Robots-Tag des polices posé dans next.config.js
    expect(matcher.test("/fonts/ClashDisplay-Variable.ttf")).toBe(false);
  });
});
