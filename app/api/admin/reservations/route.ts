import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import "@/models/Creation";
import { checkAdminAuth } from "@/lib/auth";

export async function GET(req: Request) {
    try {
        const session = await checkAdminAuth();
        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        await connectToDatabase();

        const { searchParams } = new URL(req.url);

        const page = Number(searchParams.get("page") || 1);
        const limit = Number(searchParams.get("limit") || 10);
        const status = searchParams.get("status");
        const creationId = searchParams.get("creationId");
        const search = searchParams.get("search");

        // ⚠️ FILTRE CRITIQUE : Ne montrer que les réservations payées ou les réservations manuelles (sans Stripe)
        // Les réservations avec stripeCheckoutSessionId mais paymentStatus !== "paid" sont des paiements annulés
        const paymentFilter = {
            $or: [
                { paymentStatus: "paid" }, // Paiements validés
                { stripeCheckoutSessionId: { $exists: false } }, // Réservations manuelles (sans Stripe)
                { stripeCheckoutSessionId: null }, // Réservations manuelles (sans Stripe)
            ],
        };

        // Construire toutes les conditions
        const conditions: any[] = [paymentFilter];
        
        if (status) conditions.push({ status });
        if (creationId) conditions.push({ creationId });
        
        if (search) {
            const regex = { $regex: search, $options: "i" };
            conditions.push({
                $or: [
                    { name: regex },
                    { contact: regex },
                    { message: regex },
                ],
            });
        }

        // Utiliser $and si plusieurs conditions, sinon utiliser directement
        const query: any = conditions.length > 1 ? { $and: conditions } : conditions[0];

        const total = await Reservation.countDocuments(query);

        const reservations = await Reservation.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate("creationId");

        return NextResponse.json({
            reservations,
            page,
            totalPages: Math.ceil(total / limit),
            total,
        });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}