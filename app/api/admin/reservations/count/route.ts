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
    // On compte les sessions Stripe uniques (commandes) plutôt que les réservations individuelles
    const newReservations = await Reservation.find({ 
      paymentStatus: "paid",
      seenByAdmin: { $ne: true }
    }).select("stripeCheckoutSessionId").lean();

    // Compter les sessions uniques (commandes) au lieu des réservations
    const uniqueSessions = new Set(
      newReservations
        .map(r => r.stripeCheckoutSessionId)
        .filter(id => id != null)
    );
    const newCount = uniqueSessions.size;

    // Compter les commandes en cours de préparation (payées mais pas encore expédiées)
    // Même logique : compter les sessions uniques
    const pendingReservations = await Reservation.find({ 
      paymentStatus: "paid",
      status: "pending"
    }).select("stripeCheckoutSessionId").lean();

    const uniquePendingSessions = new Set(
      pendingReservations
        .map(r => r.stripeCheckoutSessionId)
        .filter(id => id != null)
    );
    const pendingCount = uniquePendingSessions.size;

    return NextResponse.json({ 
      pending: pendingCount,
      new: newCount
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}