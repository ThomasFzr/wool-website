import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI");
const options = {};

if (!(global as any)._mongoClientPromise) {
  const client = new MongoClient(uri, options);
  (global as any)._mongoClientPromise = client.connect();
}
const clientPromise: Promise<MongoClient> = (global as any)._mongoClientPromise;

export default clientPromise;