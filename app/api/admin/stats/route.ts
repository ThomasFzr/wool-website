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

        // Données pour le graphique (12 derniers mois) - Optimisé avec aggregation
        const now = new Date();
        const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

        // Agrégation des réservations par mois
        const reservationsAgg = await Reservation.aggregate([
            {
                $match: {
                    createdAt: { $gte: twelveMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" }
                    },
                    total: { $sum: 1 },
                    validated: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "validated"] }, 1, 0]
                        }
                    }
                }
            }
        ]);

        // Agrégation des créations vendues par mois
        const creationsAgg = await Creation.aggregate([
            {
                $match: {
                    sold: true,
                    updatedAt: { $gte: twelveMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$updatedAt" },
                        month: { $month: "$updatedAt" }
                    },
                    count: { $sum: 1 },
                    revenue: { $sum: "$price" }
                }
            }
        ]);

        // Créer un map pour un accès rapide
        const resMap = new Map();
        reservationsAgg.forEach(r => {
            const key = `${r._id.year}-${r._id.month}`;
            resMap.set(key, r);
        });

        const creMap = new Map();
        creationsAgg.forEach(c => {
            const key = `${c._id.year}-${c._id.month}`;
            creMap.set(key, c);
        });

        // Construire les données mensuelles
        const monthlyData = [];
        for (let i = 11; i >= 0; i--) {
            const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const year = monthStart.getFullYear();
            const month = monthStart.getMonth() + 1;
            const key = `${year}-${month}`;

            const resData = resMap.get(key);
            const creData = creMap.get(key);

            monthlyData.push({
                month: monthStart.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
                reservations: resData?.total || 0,
                validated: resData?.validated || 0,
                revenue: creData?.revenue || 0,
                sold: creData?.count || 0
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
