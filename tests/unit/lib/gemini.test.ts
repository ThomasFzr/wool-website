import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateProductDescription } from "@/lib/gemini";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/prompts";
import { connectToDatabase } from "@/lib/db";
import Settings from "@/models/Settings";

const gemini = vi.hoisted(() => ({
  generateContent: vi.fn(),
  GoogleGenerativeAI: vi.fn(),
}));

vi.mock("@google/generative-ai", () => ({ GoogleGenerativeAI: gemini.GoogleGenerativeAI }));

const product = { type: "bonnet", color: "Rouge", material: "laine", price: 35 };

describe("generateProductDescription", () => {
  beforeEach(async () => {
    await connectToDatabase();
    vi.stubEnv("GEMINI_API_KEY", "gemini-key");
    gemini.GoogleGenerativeAI.mockImplementation(function () {
      return { getGenerativeModel: () => ({ generateContent: gemini.generateContent }) };
    });
    gemini.generateContent.mockResolvedValue({ response: { text: () => "<p>Un joli bonnet</p>" } });
  });

  const sentPrompt = () => gemini.generateContent.mock.calls[0][0] as string;

  it("exige la clé API Gemini", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(generateProductDescription(product)).rejects.toThrow(/GEMINI_API_KEY/);
    expect(gemini.generateContent).not.toHaveBeenCalled();
  });

  it("renvoie le texte généré à partir des caractéristiques et du prompt par défaut", async () => {
    expect(await generateProductDescription(product)).toBe("<p>Un joli bonnet</p>");
    expect(gemini.GoogleGenerativeAI).toHaveBeenCalledWith("gemini-key");
    expect(sentPrompt()).toContain("- Type : bonnet");
    expect(sentPrompt()).toContain("- Couleur : Rouge");
    expect(sentPrompt()).toContain("- Matière : laine");
    expect(sentPrompt()).toContain("- Prix : 35€");
    expect(sentPrompt()).toContain(DEFAULT_SYSTEM_PROMPT);
  });

  it("signale les caractéristiques manquantes", async () => {
    await generateProductDescription({ type: "", color: "", material: "", price: 0 });
    expect(sentPrompt()).toContain("- Type : non spécifié");
    expect(sentPrompt()).toContain("- Couleur : non spécifiée");
    expect(sentPrompt()).toContain("- Matière : non spécifiée");
    expect(sentPrompt()).toContain("- Prix : non spécifié");
  });

  it("utilise le prompt système personnalisé des réglages", async () => {
    await Settings.create({ systemPrompt: "Écris comme un pirate." });
    await generateProductDescription(product);
    expect(sentPrompt()).toContain("Écris comme un pirate.");
    expect(sentPrompt()).not.toContain(DEFAULT_SYSTEM_PROMPT);
  });

  it("retombe sur le prompt par défaut si le prompt personnalisé est vide", async () => {
    await Settings.create({ systemPrompt: "" });
    await generateProductDescription(product);
    expect(sentPrompt()).toContain(DEFAULT_SYSTEM_PROMPT);
  });

  it("retombe sur le prompt par défaut si la base est indisponible", async () => {
    vi.spyOn(Settings, "findById").mockImplementation(() => {
      throw new Error("base indisponible");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await generateProductDescription(product);
    expect(sentPrompt()).toContain(DEFAULT_SYSTEM_PROMPT);
  });

  it("masque l'erreur Gemini derrière un message générique", async () => {
    gemini.generateContent.mockRejectedValue(new Error("quota dépassé"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(generateProductDescription(product)).rejects.toThrow(
      "Erreur lors de la génération de la description"
    );
  });
});
