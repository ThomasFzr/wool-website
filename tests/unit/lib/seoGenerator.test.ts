import { describe, expect, it, vi } from "vitest";
import { generateSeoDescription, getColorSpecificSentence } from "@/lib/seoGenerator";

/** Force l'index choisi dans chaque liste de variantes (0 = première, 0.99 = dernière). */
const pick = (value: number) => vi.spyOn(Math, "random").mockReturnValue(value);

describe("getColorSpecificSentence", () => {
  it.each(["rose", "bleu", "rouge", "noir", "blanc", "gris", "beige"])(
    "propose une phrase dédiée au %s",
    (color) => {
      pick(0);
      expect(getColorSpecificSentence(color.toUpperCase()).toLowerCase()).toContain(color.slice(0, 4));
    }
  );

  it("reconnaît une couleur composée", () => {
    pick(0);
    expect(getColorSpecificSentence("Bleu marine")).toMatch(/bleu/i);
  });

  it("utilise une phrase générique pour une couleur inconnue", () => {
    pick(0);
    const sentence = getColorSpecificSentence("Chartreuse");
    expect(sentence).toBeTruthy();
    expect(sentence).not.toMatch(/chartreuse/i);
  });
});

describe("generateSeoDescription", () => {
  const paragraphs = (text: string) => text.split("\n\n");

  it.each([
    [0, "est un bonnet tricoté à la main dans un joli rouge"],
    [0.5, "Découvrez \"Bonnet Cerise\", un bonnet tricoté à la main dans une belle couleur rouge"],
    [0.9, "vous propose un bonnet tricoté main dans un délicat rouge"],
  ])("intro variante %s avec type et couleur", (r, expected) => {
    pick(r);
    const text = generateSeoDescription({ title: "Bonnet Cerise", type: "bonnet", color: "Rouge", price: "35" });
    expect(paragraphs(text)).toHaveLength(6);
    expect(paragraphs(text)[0]).toContain(expected);
    expect(text).toContain("35€");
  });

  it.each([
    [0, "\"Snood\" est un snood tricoté à la main. Cette création"],
    [0.5, "Découvrez \"Snood\", un snood tricoté à la main. Tricoté avec passion"],
    [0.9, "\"Snood\" vous propose un snood tricoté main. Chaque maillon"],
  ])("intro variante %s avec un type inconnu sans couleur", (r, expected) => {
    pick(r);
    const text = generateSeoDescription({ title: "Snood", type: "snood" });
    expect(paragraphs(text)[0]).toContain(expected);
    // Type sans texte dédié : paragraphe générique
    expect(paragraphs(text)[1]).toMatch(/^Conçu avec soin/);
    // Pas de prix : appel à commander
    expect(paragraphs(text).at(-1)).toMatch(/^Disponible sur commande/);
    expect(paragraphs(text)).toHaveLength(5);
  });

  it.each([
    [0, "\"Pièce\" est une pièce unique tricotée à la main."],
    [0.5, "Découvrez \"Pièce\", une création unique tricotée à la main."],
    [0.9, "\"Pièce\" est une création unique tricotée main."],
  ])("intro variante %s sans type ni couleur", (r, expected) => {
    pick(r);
    expect(paragraphs(generateSeoDescription({ title: "Pièce" }))[0]).toContain(expected);
  });

  it.each(["tour de cou", "bandeau"])("ajoute le paragraphe dédié au %s", (type) => {
    pick(0);
    expect(paragraphs(generateSeoDescription({ title: "X", type }))[1]).toContain(type);
  });

  it("omet l'introduction sans titre", () => {
    pick(0);
    const text = generateSeoDescription({ title: "", color: "Gris", price: "20" });
    expect(text).not.toContain('""');
    expect(paragraphs(text)).toHaveLength(5);
  });

  it.each([0, 0.3, 0.6, 0.9])("varie l'appel à l'action selon le tirage (%s)", (r) => {
    pick(r);
    expect(paragraphs(generateSeoDescription({ title: "X", price: "12" })).at(-1)).toContain("12€");
  });
});
