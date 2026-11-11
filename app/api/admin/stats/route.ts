import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import Creation from "@/models/Creation";
import { checkAdminAuth } from "@/lib/auth";

// Regroupe des réservations en commandes (une commande = une session Stripe,
// ou une réservation seule si pas de session)
function groupIntoOrders(reservations: any[]): Map<string, any[]> {
    const ordersMap = new Map<string, any[]>();
    reservations.forEach((res: any) => {
        const key = res.stripeCheckoutSessionId || res._id.toString();
        if (!ordersMap.has(key)) {
            ordersMap.set(key, []);
        }
        ordersMap.get(key)!.push(res);
    });
    return ordersMap;
}

export async function GET() {
    try {
        const session = await checkAdminAuth();
        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        await connectToDatabase();

        const now = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

        // Toutes les requêtes indépendantes en parallèle, avec des projections
        // minimales (on ne charge plus les documents complets pour compter)
        const [
            allReservations,
            totalCreations,
            soldCreations,
            availableCreations,
            salesResult,
            revenueResult,
            soldCreationsDetails,
            reservationsLast7Days,
            validatedReservationsLast7Days,
            reservationsLast30Days,
            validatedReservationsLast30Days,
            reservationsAgg,
            salesAgg,
            costsAgg,
        ] = await Promise.all([
            Reservation.find({}).select("stripeCheckoutSessionId status").lean(),
            Creation.countDocuments(),
            Creation.countDocuments({ sold: true }),
            Creation.countDocuments({ sold: { $ne: true } }),
            // Nombre total de ventes (somme de tous les salesCount)
            Creation.aggregate([
                { $match: { salesCount: { $exists: true, $ne: null, $gt: 0 } } },
                { $group: { _id: null, totalSales: { $sum: "$salesCount" } } }
            ]),
            // Revenus totaux (salesCount * price de chaque création)
            Creation.aggregate([
                { $match: { salesCount: { $exists: true, $ne: null, $gt: 0 } } },
                {
                    $project: {
                        revenue: { $multiply: ["$salesCount", { $ifNull: ["$price", 0] }] }
                    }
                },
                { $group: { _id: null, totalRevenue: { $sum: "$revenue" } } }
            ]),
            // Liste détaillée des créations vendues avec les infos de coût
            Creation.find({ salesCount: { $exists: true, $ne: null, $gt: 0 } })
                .select("title price salesCount imageUrl yarnPrice weight _id")
                .lean(),
            Reservation.find({ createdAt: { $gte: sevenDaysAgo } })
                .select("stripeCheckoutSessionId").lean(),
            Reservation.find({
                paymentStatus: "paid",
                $or: [
                    { paidAt: { $gte: sevenDaysAgo } },
                    { paidAt: null, updatedAt: { $gte: sevenDaysAgo } }
                ]
            }).select("stripeCheckoutSessionId").lean(),
            Reservation.find({ createdAt: { $gte: thirtyDaysAgo } })
                .select("stripeCheckoutSessionId").lean(),
            Reservation.find({
                paymentStatus: "paid",
                $or: [
                    { paidAt: { $gte: thirtyDaysAgo } },
                    { paidAt: null, updatedAt: { $gte: thirtyDaysAgo } }
                ]
            }).select("stripeCheckoutSessionId creationId")
              .populate("creationId", "price")
              .lean(),
            // Agrégation des commandes par mois (grouper par stripeCheckoutSessionId)
            Reservation.aggregate([
                {
                    $match: {
                        createdAt: { $gte: twelveMonthsAgo }
                    }
                },
                {
                    $group: {
                        _id: {
                            sessionId: { $ifNull: ["$stripeCheckoutSessionId", "$_id"] },
                            year: { $year: "$createdAt" },
                            month: { $month: "$createdAt" }
                        },
                        minDate: { $min: "$createdAt" },
                        hasValidated: {
                            $max: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] }
                        }
                    }
                },
                {
                    $group: {
                        _id: {
                            year: { $year: "$minDate" },
                            month: { $month: "$minDate" }
                        },
                        total: { $sum: 1 },
                        validated: { $sum: "$hasValidated" }
                    }
                }
            ]),
            // Agrégation des ventes par mois (basé sur les commandes payées)
            Reservation.aggregate([
                {
                    $match: {
                        paymentStatus: "paid"
                    }
                },
                {
                    $project: {
                        creationId: 1,
                        saleDate: { $ifNull: ["$paidAt", "$updatedAt"] }
                    }
                },
                {
                    $match: {
                        saleDate: { $gte: twelveMonthsAgo }
                    }
                },
                {
                    $lookup: {
                        from: "creations",
                        localField: "creationId",
                        foreignField: "_id",
                        as: "creation"
                    }
                },
                {
                    $unwind: "$creation"
                },
                {
                    $group: {
                        _id: {
                            year: { $year: "$saleDate" },
                            month: { $month: "$saleDate" }
                        },
                        count: { $sum: 1 },
                        revenue: { $sum: "$creation.price" }
                    }
                }
            ]),
            // Agrégation des coûts par mois (créations créées ce mois-là)
            Creation.aggregate([
                {
                    $match: {
                        createdAt: { $gte: twelveMonthsAgo }
                    }
                },
                {
                    $project: {
                        createdAt: 1,
                        // Coût unitaire fixe : (weight / 100) * yarnPrice
                        unitCost: {
                            $cond: {
                                if: {
                                    $and: [
                                        { $ne: ["$weight", null] },
                                        { $ne: ["$yarnPrice", null] }
                                    ]
                                },
                                then: {
                                    $multiply: [
                                        { $divide: ["$weight", 100] },
                                        "$yarnPrice"
                                    ]
                                },
                                else: 0
                            }
                        }
                    }
                },
                {
                    $group: {
                        _id: {
                            year: { $year: "$createdAt" },
                            month: { $month: "$createdAt" }
                        },
                        cost: { $sum: "$unitCost" }
                    }
                }
            ]),
        ]);

        // Compter les commandes (groupées par stripeCheckoutSessionId)
        const ordersMap = groupIntoOrders(allReservations);
        const totalOrders = ordersMap.size;

        // Compter les commandes par statut
        const ordersByStatus = {
            preparing: 0,
            validated: 0,
            cancelled: 0,
            shipped: 0,
            in_transit: 0,
            delivered: 0,
        };

        const statusPriority: Record<string, number> = {
            cancelled: 0,
            pending: 2,
            preparing: 2,
            shipped: 3,
            in_transit: 4,
            delivered: 5,
            validated: 6,
        };

        ordersMap.forEach((items) => {
            // Prendre le statut le plus avancé de la commande
            const sortedByStatus = [...items].sort((a, b) =>
                (statusPriority[b.status] || 0) - (statusPriority[a.status] || 0)
            );
            const highestStatus = sortedByStatus[0].status;

            if (highestStatus === "pending" || highestStatus === "preparing") {
                ordersByStatus.preparing++;
            } else if (highestStatus === "validated") {
                ordersByStatus.validated++;
            } else if (highestStatus === "cancelled") {
                ordersByStatus.cancelled++;
            } else if (highestStatus === "shipped") {
                ordersByStatus.shipped++;
            } else if (highestStatus === "in_transit") {
                ordersByStatus.in_transit++;
            } else if (highestStatus === "delivered") {
                ordersByStatus.delivered++;
            }
        });

        const totalSales = salesResult.length > 0 ? salesResult[0].totalSales : 0;
        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

        // Pour chaque création vendue, récupérer la date de la dernière vente
        const creationIds = soldCreationsDetails.map((c: any) => c._id);

        const lastSaleDates = await Reservation.aggregate([
            {
                $match: {
                    creationId: { $in: creationIds },
                    paymentStatus: "paid"
                }
            },
            {
                $project: {
                    creationId: 1,
                    saleDate: { $ifNull: ["$paidAt", "$updatedAt"] }
                }
            },
            {
                $group: {
                    _id: "$creationId",
                    lastSaleDate: { $max: "$saleDate" }
                }
            }
        ]);

        // Créer un map pour accès rapide (convertir les ObjectId en string)
        const saleDateMap = new Map();
        lastSaleDates.forEach((item: any) => {
            const creationIdStr = item._id.toString();
            saleDateMap.set(creationIdStr, item.lastSaleDate);
        });

        const soldCreationsList = soldCreationsDetails.map((creation: any) => {
            const creationIdStr = creation._id.toString();
            const saleDate = saleDateMap.get(creationIdStr);

            // Coût unitaire fixe depuis la création : (weight / 100) * yarnPrice
            const unitCost = creation.weight && creation.yarnPrice
                ? (creation.weight / 100) * creation.yarnPrice
                : 0;
            const totalCost = unitCost * creation.salesCount;
            const creationRevenue = (creation.price || 0) * creation.salesCount;
            const profit = creationRevenue - totalCost;

            return {
                _id: creation._id.toString(),
                title: creation.title,
                price: creation.price || 0,
                salesCount: creation.salesCount,
                totalRevenue: creationRevenue,
                unitCost: unitCost,
                totalCost: totalCost,
                profit: profit,
                imageUrl: creation.imageUrl,
                lastSaleDate: saleDate || null, // Date de la dernière vente
            };
        })
        .sort((a, b) => {
            // Trier par date de vente décroissante (les plus récentes en premier)
            if (!a.lastSaleDate && !b.lastSaleDate) return 0;
            if (!a.lastSaleDate) return 1;
            if (!b.lastSaleDate) return -1;

            const dateA = new Date(a.lastSaleDate).getTime();
            const dateB = new Date(b.lastSaleDate).getTime();
            return dateB - dateA;
        });

        // Prix moyen par vente
        const averagePrice = totalSales > 0 ? totalRevenue / totalSales : 0;

        // Compteurs de commandes sur 7 et 30 jours
        const ordersLast7Days = groupIntoOrders(reservationsLast7Days).size;
        const validatedLast7Days = groupIntoOrders(validatedReservationsLast7Days).size;
        const ordersLast30Days = groupIntoOrders(reservationsLast30Days).size;
        const validatedLast30Days = groupIntoOrders(validatedReservationsLast30Days).size;

        // Revenus et nombre de ventes des 30 derniers jours
        const soldCountLast30Days = validatedReservationsLast30Days.length;
        const revenueLast30Days = validatedReservationsLast30Days.reduce((sum: number, reservation: any) => {
            const creation = reservation.creationId;
            return sum + (creation?.price || 0);
        }, 0);

        // Créer un map pour un accès rapide
        const resMap = new Map();
        reservationsAgg.forEach((r: any) => {
            const key = `${r._id.year}-${r._id.month}`;
            resMap.set(key, r);
        });

        const salesMap = new Map();
        salesAgg.forEach((s: any) => {
            const key = `${s._id.year}-${s._id.month}`;
            salesMap.set(key, s);
        });

        const costsMap = new Map();
        costsAgg.forEach((c: any) => {
            const key = `${c._id.year}-${c._id.month}`;
            costsMap.set(key, c);
        });

        // Construire les données mensuelles
        const monthlyData = [];
        for (let i = 11; i >= 0; i--) {
            const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const year = monthStart.getFullYear();
            const month = monthStart.getMonth() + 1;
            const key = `${year}-${month}`;

            const resData = resMap.get(key);
            const salesData = salesMap.get(key);
            const costData = costsMap.get(key);

            const revenue = salesData?.revenue || 0;
            const cost = costData?.cost || 0; // Coût de toutes les créations créées ce mois
            const profit = revenue - cost; // Les ventes compensent les coûts

            monthlyData.push({
                month: monthStart.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
                orders: resData?.total || 0,
                validated: resData?.validated || 0,
                revenue: revenue,
                cost: cost,
                profit: profit,
                sold: salesData?.count || 0
            });
        }

        return NextResponse.json({
            orders: {
                total: totalOrders,
                preparing: ordersByStatus.preparing,
                validated: ordersByStatus.validated,
                cancelled: ordersByStatus.cancelled,
                shipped: ordersByStatus.shipped,
                in_transit: ordersByStatus.in_transit,
                delivered: ordersByStatus.delivered,
                last7Days: ordersLast7Days,
                last30Days: ordersLast30Days,
                validatedLast7Days,
                validatedLast30Days,
            },
            creations: {
                total: totalCreations,
                sold: soldCreations, // Nombre de créations actuellement vendues
                available: availableCreations,
            },
            revenue: {
                total: totalRevenue,
                average: averagePrice,
                last30Days: revenueLast30Days,
                soldLast30Days: soldCountLast30Days,
                totalSales: totalSales, // Nombre total de ventes (historique avec salesCount)
                soldCreations: soldCreationsList, // Liste détaillée des créations vendues
            },
            monthlyData
        });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
