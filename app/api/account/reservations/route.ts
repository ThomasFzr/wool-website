import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import "@/models/Creation";
import { escapeRegex } from "@/lib/escape";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

/** Entier strictement positif lu dans l'URL, sinon la valeur par défaut ; borné à max. */
function positiveInt(value: string | null, fallback: number, max = Infinity) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Non authentifié" },
        { status: 401 }
      );
    }

    await connectToDatabase();

    const searchParams = req.nextUrl.searchParams;
    const page = positiveInt(searchParams.get("page"), 1);
    const limit = positiveInt(searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const query: any = {
      contact: session.user.email, // 🔥 ne renvoie QUE les commandes de cet email
      paymentStatus: "paid", // 🔥 uniquement les commandes payées
    };

    if (status) {
      query.status = status;
    }

    if (search) {
      const regex = { $regex: escapeRegex(search), $options: "i" };
      query.$or = [
        { name: regex },
        { message: regex },
      ];
    }

    const [total, reservations] = await Promise.all([
      Reservation.countDocuments(query),
      Reservation.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("creationId", "title description images imageUrl price color")
        .lean(),
    ]);

    return NextResponse.json({
      reservations,
      page,
      totalPages: Math.ceil(total / limit),
      total,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}