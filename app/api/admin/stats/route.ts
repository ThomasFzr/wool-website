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

        // Compter les commandes (groupées par stripeCheckoutSessionId)
        // Récupérer toutes les réservations pour les grouper
        const allReservations = await Reservation.find({}).lean();
        
        // Grouper par stripeCheckoutSessionId (ou _id si pas de session) pour compter les commandes
        const ordersMap = new Map<string, any[]>();
        allReservations.forEach((res: any) => {
            const key = res.stripeCheckoutSessionId || res._id.toString();
            if (!ordersMap.has(key)) {
                ordersMap.set(key, []);
            }
            ordersMap.get(key)!.push(res);
        });
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
        
        ordersMap.forEach((items) => {
            // Prendre le statut le plus avancé de la commande
            const statusPriority: Record<string, number> = {
                cancelled: 0,
                pending: 2,
                preparing: 2,
                shipped: 3,
                in_transit: 4,
                delivered: 5,
                validated: 6,
            };
            
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

        // Statistiques des créations
        const totalCreations = await Creation.countDocuments();
        const soldCreations = await Creation.countDocuments({ sold: true });
        const availableCreations = await Creation.countDocuments({ 
            sold: { $ne: true }
        });

        // Nombre total de ventes (somme de tous les salesCount, en excluant null/undefined)
        const salesResult = await Creation.aggregate([
            { $match: { salesCount: { $exists: true, $ne: null, $gt: 0 } } },
            { $group: { _id: null, totalSales: { $sum: "$salesCount" } } }
        ]);
        const totalSales = salesResult.length > 0 ? salesResult[0].totalSales : 0;

        // Revenus totaux (basé sur salesCount * price de chaque création)
        const revenueResult = await Creation.aggregate([
            { $match: { salesCount: { $exists: true, $ne: null, $gt: 0 } } },
            { 
                $project: { 
                    revenue: { $multiply: ["$salesCount", { $ifNull: ["$price", 0] }] } 
                } 
            },
            { $group: { _id: null, totalRevenue: { $sum: "$revenue" } } }
        ]);
        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

        // Liste détaillée des créations vendues avec leurs statistiques
        // Récupérer les créations vendues avec les infos de coût
        const soldCreationsDetails = await Creation.find({
            salesCount: { $exists: true, $ne: null, $gt: 0 }
        })
        .select("title price salesCount imageUrl yarnPrice weight _id")
        .lean();
        
        // Pour chaque création, récupérer la date de la dernière vente
        const creationIds = soldCreationsDetails.map((c: any) => c._id);
        
        // Récupérer les dates de vente depuis les commandes payées
        // Utiliser paidAt si disponible, sinon updatedAt
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
            const creationIdStr = item._id?.toString() || item._id;
            saleDateMap.set(creationIdStr, item.lastSaleDate);
        });
        
        const soldCreationsList = soldCreationsDetails.map((creation: any) => {
            const creationIdStr = creation._id?.toString() || creation._id;
            const saleDate = saleDateMap.get(creationIdStr);
            
            // Calculer le coût unitaire fixe depuis la création dans la BDD : (weight / 100) * yarnPrice
            // Le coût est fixe et ne change pas, basé sur les valeurs stockées dans la création
            const unitCost = creation.weight && creation.yarnPrice 
                ? (creation.weight / 100) * creation.yarnPrice 
                : 0;
            const totalCost = unitCost * (creation.salesCount || 0);
            const totalRevenue = (creation.price || 0) * (creation.salesCount || 0);
            const profit = totalRevenue - totalCost;
            
            return {
                _id: creation._id.toString(),
                title: creation.title,
                price: creation.price || 0,
                salesCount: creation.salesCount || 0,
                totalRevenue: totalRevenue,
                unitCost: unitCost,
                totalCost: totalCost,
                profit: profit,
                imageUrl: creation.imageUrl,
                lastSaleDate: saleDate || null, // Date de la dernière vente
            };
        })
        .sort((a, b) => {
            // Trier par date de vente décroissante (les plus récentes en premier)
            // Si pas de date, placer en bas
            if (!a.lastSaleDate && !b.lastSaleDate) return 0;
            if (!a.lastSaleDate) return 1; // a sans date va en bas
            if (!b.lastSaleDate) return -1; // b sans date va en bas
            
            const dateA = new Date(a.lastSaleDate).getTime();
            const dateB = new Date(b.lastSaleDate).getTime();
            return dateB - dateA; // Ordre décroissant : les plus récentes en premier
        });

        // Prix moyen par vente
        const averagePrice = totalSales > 0 ? totalRevenue / totalSales : 0;

        // Statistiques des 7 derniers jours (commandes)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const reservationsLast7Days = await Reservation.find({
            createdAt: { $gte: sevenDaysAgo }
        }).lean();
        
        // Grouper en commandes
        const ordersMap7Days = new Map<string, any[]>();
        reservationsLast7Days.forEach((res: any) => {
            const key = res.stripeCheckoutSessionId || res._id.toString();
            if (!ordersMap7Days.has(key)) {
                ordersMap7Days.set(key, []);
            }
            ordersMap7Days.get(key)!.push(res);
        });
        const ordersLast7Days = ordersMap7Days.size;

        const validatedReservationsLast7Days = await Reservation.find({
            paymentStatus: "paid",
            $or: [
                { paidAt: { $gte: sevenDaysAgo } },
                { paidAt: null, updatedAt: { $gte: sevenDaysAgo } }
            ]
        }).lean();
        
        const validatedOrdersMap7Days = new Map<string, any[]>();
        validatedReservationsLast7Days.forEach((res: any) => {
            const key = res.stripeCheckoutSessionId || res._id.toString();
            if (!validatedOrdersMap7Days.has(key)) {
                validatedOrdersMap7Days.set(key, []);
            }
            validatedOrdersMap7Days.get(key)!.push(res);
        });
        const validatedLast7Days = validatedOrdersMap7Days.size;

        // Statistiques des 30 derniers jours (commandes)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const reservationsLast30Days = await Reservation.find({
            createdAt: { $gte: thirtyDaysAgo }
        }).lean();
        
        // Grouper en commandes
        const ordersMap30Days = new Map<string, any[]>();
        reservationsLast30Days.forEach((res: any) => {
            const key = res.stripeCheckoutSessionId || res._id.toString();
            if (!ordersMap30Days.has(key)) {
                ordersMap30Days.set(key, []);
            }
            ordersMap30Days.get(key)!.push(res);
        });
        const ordersLast30Days = ordersMap30Days.size;

        // Récupérer les commandes payées pour compter les commandes et calculer les revenus
        const validatedReservationsLast30Days = await Reservation.find({
            paymentStatus: "paid",
            $or: [
                { paidAt: { $gte: thirtyDaysAgo } },
                { paidAt: null, updatedAt: { $gte: thirtyDaysAgo } }
            ]
        }).populate("creationId").lean();
        
        // Grouper en commandes pour le comptage
        const validatedOrdersMap30Days = new Map<string, any[]>();
        validatedReservationsLast30Days.forEach((res: any) => {
            const key = res.stripeCheckoutSessionId || res._id.toString();
            if (!validatedOrdersMap30Days.has(key)) {
                validatedOrdersMap30Days.set(key, []);
            }
            validatedOrdersMap30Days.get(key)!.push(res);
        });
        const validatedLast30Days = validatedOrdersMap30Days.size;
        
        // Calculer les revenus et le nombre de ventes
        const soldCountLast30Days = validatedReservationsLast30Days.length;
        const revenueLast30Days = validatedReservationsLast30Days.reduce((sum, reservation: any) => {
            const creation = reservation.creationId;
            return sum + (creation?.price || 0);
        }, 0);

        // Données pour le graphique (12 derniers mois) - Optimisé avec aggregation
        const now = new Date();
        const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

        // Agrégation des commandes par mois (grouper par stripeCheckoutSessionId)
        // On prend la date de création de la première réservation de chaque commande
        const reservationsAgg = await Reservation.aggregate([
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
        ]);

        // Agrégation des ventes par mois (basé sur les commandes payées)
        // Utiliser paidAt si disponible, sinon updatedAt pour dater les ventes
        const salesAgg = await Reservation.aggregate([
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
        ]);

        // Agrégation des coûts par mois (basé sur la date de création des créations)
        // Le coût est la somme de toutes les créations créées ce mois-là
        const costsAgg = await Creation.aggregate([
            {
                $match: {
                    createdAt: { $gte: twelveMonthsAgo }
                }
            },
            {
                $project: {
                    createdAt: 1,
                    // Calculer le coût unitaire fixe depuis la création dans la BDD : (weight / 100) * yarnPrice
                    // Le coût est fixe et ne change pas, basé sur les valeurs stockées dans la création
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
        ]);

        // Créer un map pour un accès rapide
        const resMap = new Map();
        reservationsAgg.forEach(r => {
            const key = `${r._id.year}-${r._id.month}`;
            resMap.set(key, r);
        });

        const salesMap = new Map();
        salesAgg.forEach(s => {
            const key = `${s._id.year}-${s._id.month}`;
            salesMap.set(key, s);
        });

        const costsMap = new Map();
        costsAgg.forEach(c => {
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
                orders: resData?.total || 0, // Changé de reservations à orders
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
