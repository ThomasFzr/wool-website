import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import { checkAdminAuth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await connectToDatabase();

    const pendingCount = await Reservation.countDocuments({ status: "pending" });

    return NextResponse.json({ pending: pendingCount });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}