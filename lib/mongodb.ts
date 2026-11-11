import { MongoClient } from "mongodb";

/**
 * Client MongoDB natif partagé (utilisé par l'adaptateur NextAuth).
 *
 * À appeler à chaque utilisation plutôt que de garder la promesse : après un échec de
 * connexion, le cache est vidé et l'appel suivant retente au lieu de renvoyer
 * indéfiniment la même promesse rejetée.
 */
export function getClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI");

  if (!(global as any)._mongoClientPromise) {
    const client = new MongoClient(uri, {});
    // Ne pas mettre en cache une promesse rejetée : l'instance resterait sans base jusqu'à son recyclage
    (global as any)._mongoClientPromise = client.connect().catch((err) => {
      (global as any)._mongoClientPromise = null;
      throw err;
    });
  }
  return (global as any)._mongoClientPromise;
}
