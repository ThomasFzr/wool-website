import { describe, expect, it } from "vitest";
import { escapeHtml, escapeRegex } from "@/lib/escape";

describe("escapeHtml", () => {
  it("retourne une chaîne vide pour null et undefined", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("échappe les caractères HTML", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;"
    );
  });

  it("convertit les valeurs non textuelles", () => {
    expect(escapeHtml(42)).toBe("42");
  });
});

describe("escapeRegex", () => {
  it("neutralise les métacaractères regex", () => {
    const input = "a.b*c+(d)?[e]{f}|g^h$i\\j";
    expect(new RegExp(`^${escapeRegex(input)}$`).test(input)).toBe(true);
    expect(new RegExp(escapeRegex(".*")).test("abc")).toBe(false);
  });
});
