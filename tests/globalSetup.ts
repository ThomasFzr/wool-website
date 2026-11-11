import { MongoMemoryServer } from "mongodb-memory-server";

// Une base MongoDB en mémoire pour toute la suite : aucun test ne touche à la vraie base.
export default async function setup() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  return async () => {
    await mongod.stop();
  };
}
