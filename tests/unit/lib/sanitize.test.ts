import { describe, expect, it } from "vitest";
import { sanitizeDescriptionHtml } from "@/lib/sanitize";

describe("sanitizeDescriptionHtml", () => {
  it("garde la mise en forme générée pour les descriptions", () => {
    const html = "<p>Bonnet en <strong>mérinos</strong><br />doux</p><ul><li><em>chaud</em></li></ul>";
    expect(sanitizeDescriptionHtml(html)).toBe(html);
  });

  it.each([
    ['<img src=x onerror="alert(1)">', ""],
    ["<script>alert(1)</script><p>ok</p>", "<p>ok</p>"],
    ['<p onclick="alert(1)">texte</p>', "<p>texte</p>"],
    ['<svg><script>alert(1)</script></svg>', ""],
    ['<iframe src="https://evil.example"></iframe>', ""],
    ['<a href="javascript:alert(1)">lien</a>', "<a>lien</a>"],
    ['<a href="//evil.example">lien</a>', "<a>lien</a>"],
    ['<p style="background:url(x)">s</p>', "<p>s</p>"],
  ])("retire le contenu dangereux : %s", (input, expected) => {
    expect(sanitizeDescriptionHtml(input)).toBe(expected.replace("<a>", '<a rel="noopener noreferrer nofollow">'));
  });

  it("garde les liens http(s) en ajoutant rel", () => {
    expect(sanitizeDescriptionHtml('<a href="https://maillemum.fr" target="_blank">site</a>')).toBe(
      '<a href="https://maillemum.fr" rel="noopener noreferrer nofollow">site</a>'
    );
  });

  it("renvoie une chaîne vide pour une valeur qui n'est pas du texte", () => {
    expect(sanitizeDescriptionHtml(undefined)).toBe("");
    expect(sanitizeDescriptionHtml(42)).toBe("");
  });
});
