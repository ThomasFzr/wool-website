import { describe, expect, it, vi } from "vitest";
import { emailTemplate } from "@/lib/emailTemplate";

describe("emailTemplate", () => {
  it("encadre le contenu avec le logo du site configuré", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://maillemum.fr");
    const html = emailTemplate("<p>Bonjour</p>");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<p>Bonjour</p>");
    expect(html).toContain('src="https://maillemum.fr/images/logo.png"');
    expect(html).toContain("généré automatiquement par MailleMum");
  });

  it("omet le logo sans URL de base", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    const html = emailTemplate("<p>Bonjour</p>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("undefined");
  });
});
