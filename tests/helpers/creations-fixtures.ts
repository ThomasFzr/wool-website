import Creation from "@/models/Creation";

let counter = 0;

/** Crée une création valide en base (les champs obligatoires sont remplis). */
export async function createCreation(overrides: Record<string, unknown> = {}) {
  counter++;
  return Creation.create({
    title: `Création ${counter}`,
    slug: `creation-${counter}`,
    price: 30,
    color: "Rose",
    type: "bonnet",
    ...overrides,
  });
}

/** Insère un document brut (sans valeurs par défaut ni validation Mongoose). */
export async function insertRawCreation(doc: Record<string, unknown>) {
  const { insertedId } = await Creation.collection.insertOne(doc);
  return insertedId;
}
