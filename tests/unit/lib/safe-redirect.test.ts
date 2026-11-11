import { describe, expect, it } from "vitest";
import { safeCallbackPath } from "@/lib/safe-redirect";

describe("safeCallbackPath", () => {
  it.each([
    ["/", "/"],
    ["/cart", "/cart"],
    ["/account/orders?page=2#haut", "/account/orders?page=2#haut"],
    ["/creations/bonnet-rose", "/creations/bonnet-rose"],
  ])("garde un chemin interne : %s", (value, expected) => {
    expect(safeCallbackPath(value)).toBe(expected);
  });

  it.each([
    ["absent", null],
    ["undefined", undefined],
    ["vide", ""],
    ["URL absolue", "https://phishing.example/login"],
    ["protocole relatif", "//phishing.example"],
    ["barre oblique inverse", "/\\phishing.example"],
    ["tabulation ignorée par le navigateur", "/\t/phishing.example"],
    ["javascript:", "javascript:alert(1)"],
    ["chemin relatif", "cart"],
    ["hôte invalide", "//["],
  ])("renvoie vers l'accueil pour une valeur non sûre (%s)", (_label, value) => {
    expect(safeCallbackPath(value)).toBe("/");
  });
});
