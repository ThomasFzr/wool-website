import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";

export async function GET() {
  try {
    await connectToDatabase();

    const pendingCount = await Reservation.countDocuments({ status: "pending" });

    return NextResponse.json({ pending: pendingCount });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}