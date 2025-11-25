import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import "@/models/Creation";

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
    const page = Number(searchParams.get("page") || 1);
    const limit = Number(searchParams.get("limit") || 10);
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const query: any = {
      contact: session.user.email, // 🔥 ne renvoie QUE les réservations de cet email
    };

    if (status) {
      query.status = status;
    }

    if (search) {
      const regex = { $regex: search, $options: "i" };
      query.$or = [
        { name: regex },
        { message: regex },
      ];
    }

    const total = await Reservation.countDocuments(query);

    const reservations = await Reservation.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("creationId", "title description images imageUrl price color");

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