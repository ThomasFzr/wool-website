import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI");
const options = {};

if (!(global as any)._mongoClientPromise) {
  const client = new MongoClient(uri, options);
  // Ne pas mettre en cache une promesse rejetée : l'instance resterait sans base jusqu'à son recyclage
  (global as any)._mongoClientPromise = client.connect().catch((err) => {
    (global as any)._mongoClientPromise = null;
    throw err;
  });
}
const clientPromise: Promise<MongoClient> = (global as any)._mongoClientPromise;

export default clientPromise;