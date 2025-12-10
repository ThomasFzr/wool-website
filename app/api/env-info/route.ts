import { NextResponse } from "next/server";

export async function GET() {
  const mongodbUri = process.env.MONGODB_URI || "";

  // Détecter si on utilise une base locale
  const isLocalDb =
    mongodbUri.includes("localhost") ||
    mongodbUri.includes("127.0.0.1") ||
    mongodbUri.startsWith("mongodb://localhost") ||
    mongodbUri.startsWith("mongodb://127.0.0.1");

  // Extraire le nom de la base de données
  let dbName: string | null = null;
  if (isLocalDb) {
    // Pour localhost: mongodb://localhost:27017/dbname
    const match = mongodbUri.match(/mongodb:\/\/[^/]+\/([^?]+)/);
    if (match) {
      dbName = match[1];
    } else {
      dbName = "localhost";
    }
  } else {
    // Pour Atlas: mongodb+srv://...@cluster.mongodb.net/dbname
    const match = mongodbUri.match(/mongodb\+srv:\/\/[^@]+@[^/]+\/([^?]+)/);
    if (match) {
      dbName = match[1];
    }
  }

  return NextResponse.json({
    isLocalDb,
    dbName,
    nodeEnv: process.env.NODE_ENV,
  });
}
