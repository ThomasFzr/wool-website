import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import Creation from "@/models/Creation";
import { checkAdminAuth } from "@/lib/auth";

export async function GET() {
    try {
        const session = await checkAdminAuth();
        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        await connectToDatabase();

        // Statistiques des réservations
        const totalReservations = await Reservation.countDocuments();
        const pendingReservations = await Reservation.countDocuments({ status: "pending" });
        const validatedReservations = await Reservation.countDocuments({ status: "validated" });
        const cancelledReservations = await Reservation.countDocuments({ status: "cancelled" });

        // Statistiques des créations
        const totalCreations = await Creation.countDocuments();
        const soldCreations = await Creation.countDocuments({ sold: true });
        const reservedCreations = await Creation.countDocuments({ reserved: true });
        const availableCreations = await Creation.countDocuments({ sold: false, reserved: false });

        // Revenus totaux (créations vendues)
        const soldItems = await Creation.find({ sold: true });
        const totalRevenue = soldItems.reduce((sum, item) => sum + (item.price || 0), 0);

        // Prix moyen des créations vendues
        const averagePrice = soldCreations > 0 ? totalRevenue / soldCreations : 0;

        // Statistiques des 7 derniers jours
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const reservationsLast7Days = await Reservation.countDocuments({
            createdAt: { $gte: sevenDaysAgo }
        });

        const validatedLast7Days = await Reservation.countDocuments({
            status: "validated",
            updatedAt: { $gte: sevenDaysAgo }
        });

        // Statistiques des 30 derniers jours
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const reservationsLast30Days = await Reservation.countDocuments({
            createdAt: { $gte: thirtyDaysAgo }
        });

        const validatedLast30Days = await Reservation.countDocuments({
            status: "validated",
            updatedAt: { $gte: thirtyDaysAgo }
        });

        // Revenus des 30 derniers jours
        const soldLast30Days = await Creation.find({
            sold: true,
            updatedAt: { $gte: thirtyDaysAgo }
        });
        const revenueLast30Days = soldLast30Days.reduce((sum, item) => sum + (item.price || 0), 0);

        // Données pour le graphique (12 derniers mois)
        const monthlyData = [];
        const now = new Date();
        
        for (let i = 11; i >= 0; i--) {
            const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
            
            const monthReservations = await Reservation.countDocuments({
                createdAt: { $gte: monthStart, $lte: monthEnd }
            });
            
            const monthValidated = await Reservation.countDocuments({
                status: "validated",
                updatedAt: { $gte: monthStart, $lte: monthEnd }
            });

            const monthSold = await Creation.find({
                sold: true,
                updatedAt: { $gte: monthStart, $lte: monthEnd }
            });

            const monthRevenue = monthSold.reduce((sum, item) => sum + (item.price || 0), 0);

            monthlyData.push({
                month: monthStart.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
                reservations: monthReservations,
                validated: monthValidated,
                revenue: monthRevenue,
                sold: monthSold.length
            });
        }

        return NextResponse.json({
            reservations: {
                total: totalReservations,
                pending: pendingReservations,
                validated: validatedReservations,
                cancelled: cancelledReservations,
                last7Days: reservationsLast7Days,
                last30Days: reservationsLast30Days,
                validatedLast7Days,
                validatedLast30Days,
            },
            creations: {
                total: totalCreations,
                sold: soldCreations,
                reserved: reservedCreations,
                available: availableCreations,
            },
            revenue: {
                total: totalRevenue,
                average: averagePrice,
                last30Days: revenueLast30Days,
                soldLast30Days: soldLast30Days.length,
            },
            monthlyData
        });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
