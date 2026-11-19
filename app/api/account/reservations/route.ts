import mongoose from "mongoose";
import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import "@/models/Creation";
import { escapeRegex } from "@/lib/escape";
import { z } from "zod";
import { pageNumber, parseQuery, text } from "@/lib/validation";
import { RESERVATION_STATUSES } from "@/models/Reservation";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const querySchema = z.object({
  page: pageNumber(1),
  limit: pageNumber(DEFAULT_LIMIT, MAX_LIMIT),
  status: z.enum(RESERVATION_STATUSES, "Statut invalide.").optional(),
  search: text(100).optional(),
});

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

    const parsed = parseQuery(req.nextUrl.searchParams, querySchema);
    if (!parsed.ok) return parsed.response;
    const { page, limit, status, search } = parsed.data;

    const query: any = {
      contact: session.user.email, // 🔥 ne renvoie QUE les commandes de cet email
      paymentStatus: "paid", // 🔥 uniquement les commandes payées
    };

    if (status) {
      query.status = status;
    }

    if (search) {
      const regex = mongoose.trusted({ $regex: escapeRegex(search), $options: "i" });
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