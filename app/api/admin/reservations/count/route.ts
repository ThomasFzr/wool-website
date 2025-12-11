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

    // Compter les nouvelles commandes payées non vues
    const newCount = await Reservation.countDocuments({ 
      paymentStatus: "paid",
      seenByAdmin: { $ne: true }
    });

    // Compter les commandes en cours de préparation (payées mais pas encore expédiées)
    const pendingCount = await Reservation.countDocuments({ 
      paymentStatus: "paid",
      status: "pending"
    });

    return NextResponse.json({ 
      pending: pendingCount,
      new: newCount
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}