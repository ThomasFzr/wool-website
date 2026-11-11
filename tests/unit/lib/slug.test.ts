import { describe, expect, it } from "vitest";
import { findRenamedSlug, generateSlug, generateUniqueSlug } from "@/lib/slug";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";

describe("generateSlug", () => {
  it("met en minuscules, retire les accents et remplace les séparateurs", () => {
    expect(generateSlug("  Bonnet Été — Laine Mérinos!  ")).toBe("bonnet-ete-laine-merinos");
  });

  it("retourne une chaîne vide sans caractère utilisable", () => {
    expect(generateSlug("!!!")).toBe("");
  });
});

describe("generateUniqueSlug", () => {
  async function createWithSlug(slug: string) {
    return Creation.collection.insertOne({ title: slug, slug });
  }

  it("retourne le slug de base s'il est libre", async () => {
    await connectToDatabase();
    expect(await generateUniqueSlug("Bonnet")).toBe("bonnet");
  });

  it("utilise « creation » quand le titre ne donne aucun slug", async () => {
    await connectToDatabase();
    expect(await generateUniqueSlug("???")).toBe("creation");
  });

  it("ajoute le premier suffixe libre", async () => {
    await connectToDatabase();
    await createWithSlug("bonnet");
    await createWithSlug("bonnet-1");
    await createWithSlug("bonnet-rouge");
    expect(await generateUniqueSlug("Bonnet")).toBe("bonnet-2");
  });

  it("ignore la création en cours de modification", async () => {
    await connectToDatabase();
    const { insertedId } = await createWithSlug("bonnet");
    expect(await generateUniqueSlug("Bonnet", insertedId.toString())).toBe("bonnet");
  });

  it("réserve les anciens slugs des autres créations (leurs liens y redirigent)", async () => {
    await connectToDatabase();
    await Creation.collection.insertOne({ title: "Renommé", slug: "bonnet-rose", previousSlugs: ["bonnet", "bonnet-1"] });
    expect(await generateUniqueSlug("Bonnet")).toBe("bonnet-2");
  });

  it("rend à une création un de ses propres anciens slugs", async () => {
    await connectToDatabase();
    const { insertedId } = await Creation.collection.insertOne({ title: "Renommé", slug: "bonnet-rose", previousSlugs: ["bonnet"] });
    expect(await generateUniqueSlug("Bonnet", insertedId.toString())).toBe("bonnet");
  });
});

describe("findRenamedSlug", () => {
  it("donne le slug actuel d'une création renommée", async () => {
    await connectToDatabase();
    await Creation.collection.insertOne({ title: "B", slug: "nouveau", previousSlugs: ["ancien", "tres-ancien"] });
    expect(await findRenamedSlug("tres-ancien")).toBe("nouveau");
  });

  it("renvoie null pour un slug inconnu, une création cachée ou sans slug", async () => {
    await connectToDatabase();
    await Creation.collection.insertOne({ title: "C", slug: "cachee", previousSlugs: ["ancien-cache"], hidden: true });
    await Creation.collection.insertOne({ title: "D", previousSlugs: ["sans-slug"] });
    expect(await findRenamedSlug("inconnu")).toBeNull();
    expect(await findRenamedSlug("ancien-cache")).toBeNull();
    expect(await findRenamedSlug("sans-slug")).toBeNull();
  });
});
