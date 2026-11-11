// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { cleanup, renderHook } from "@testing-library/react";
import { useIsNewArticle } from "@/hooks/useIsNewArticle";

afterEach(() => cleanup());

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();

describe("useIsNewArticle", () => {
  it("affiche le badge pendant 7 jours après la mise en ligne", () => {
    expect(renderHook(() => useIsNewArticle(true, daysAgo(2))).result.current).toBe(true);
    expect(renderHook(() => useIsNewArticle(true, new Date(daysAgo(8)))).result.current).toBe(false);
  });

  it("suit showAsNew quand il n'y a pas de date, et rien si l'article n'est pas marqué nouveau", () => {
    expect(renderHook(() => useIsNewArticle(true, undefined)).result.current).toBe(true);
    expect(renderHook(() => useIsNewArticle(false, daysAgo(1))).result.current).toBe(false);
    expect(renderHook(() => useIsNewArticle(undefined, null)).result.current).toBe(false);
  });

  it("ne lit pas l'heure pendant le rendu serveur (même HTML qu'à l'hydratation)", () => {
    function Badge() {
      return createElement("span", null, useIsNewArticle(true, daysAgo(1)) ? "Nouveau" : "");
    }
    expect(renderToString(createElement(Badge))).toBe("<span></span>");
  });
});
