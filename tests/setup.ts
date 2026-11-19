import { afterAll, afterEach, vi } from "vitest";
import mongoose from "mongoose";

// Valeurs par défaut des variables d'environnement nécessaires au chargement des modules
process.env.AUTH_SECRET ??= "test-secret";
process.env.NEXTAUTH_URL ??= "http://localhost:3000";

// Chaque fichier de test a sa propre base, vidée après chaque test
const dbName = `test_${process.pid}_${Math.random().toString(36).slice(2)}`;
if (process.env.MONGODB_URI) {
  const url = new URL(process.env.MONGODB_URI);
  url.pathname = `/${dbName}`;
  process.env.MONGODB_URI = url.toString();
}

afterEach(async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = await mongoose.connection.db!.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

// Hors requête Next, revalidatePath lève une erreur : on l'observe sans l'exécuter
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

// Aucun test n'interroge la vraie API Have I Been Pwned : faux pwnedCount (tests/helpers/hibp-fake).
// lib/hibp est testé sur son code réel (vi.importActual) dans tests/unit/lib/hibp.test.ts.
vi.mock("@/lib/hibp", async () => {
  const { fakePwnedCount } = await import("./helpers/hibp-fake");
  return { pwnedCount: vi.fn(fakePwnedCount) };
});
