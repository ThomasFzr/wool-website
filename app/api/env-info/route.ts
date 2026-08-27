import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth";

// Route de debug (bandeau d'environnement en local) : expose le nom de la base.
// En production, réservée aux admins pour ne pas divulguer l'infrastructure.
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    const session = await checkAdminAuth();
    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

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
