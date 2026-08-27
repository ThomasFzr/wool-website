import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) throw new Error("Missing MONGODB_URI");

// Cache global : réutilise la connexion entre invocations serverless et hot-reloads dev
let cached = (global as any).mongoose;
if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

export async function connectToDatabase() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI as string, {
        bufferCommands: false,
        maxPoolSize: 10,
      })
      .then((m) => m)
      .catch((err) => {
        // Ne pas mettre en cache une promesse rejetée, sinon toute reconnexion est impossible
        cached.promise = null;
        throw err;
      });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
