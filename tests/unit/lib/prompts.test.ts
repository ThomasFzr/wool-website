import { describe, expect, it } from "vitest";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/prompts";

describe("DEFAULT_SYSTEM_PROMPT", () => {
  it("interdit de citer la marque du fil et encadre l'usage du mot laine", () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain("MailleMum");
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/INTERDIT d'utiliser le mot "laine"/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/JAMAIS la marque/);
  });
});
