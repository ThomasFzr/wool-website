import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import Creation from "@/models/Creation";
import User from "@/models/User";
import "@/models/Creation";
import { checkAdminAuth } from "@/lib/auth";
import { revalidateCatalog } from "@/lib/revalidate";
import { escapeRegex } from "@/lib/escape";

const MAX_LIMIT = 100;

/** Entier strictement positif lu dans l'URL, sinon la valeur par défaut ; borné à max. */
function positiveInt(value: string | null, fallback: number, max = Infinity) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) return fallback;
    return Math.min(n, max);
}

/**
 * GET /api/admin/reservations
 * Pagine par COMMANDE (articles d'une même session de paiement) et non par article :
 * une page contient toujours tous les articles de ses commandes, pour que les actions
 * groupées portent sur la commande entière. `total` et `totalPages` comptent des commandes.
 * Les filtres retiennent les commandes dont au moins un article correspond.
 */
export async function GET(req: Request) {
    try {
        const session = await checkAdminAuth();
        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        await connectToDatabase();

        const { searchParams } = new URL(req.url);

        const page = positiveInt(searchParams.get("page"), 1);
        const limit = positiveInt(searchParams.get("limit"), 10, MAX_LIMIT);
        const status = searchParams.get("status");
        const creationId = searchParams.get("creationId");
        const search = searchParams.get("search");

        // ⚠️ FILTRE CRITIQUE : Ne montrer que les réservations payées ou les réservations manuelles (sans Stripe)
        // Les réservations avec stripeCheckoutSessionId mais paymentStatus !== "paid" sont des paiements annulés
        const paymentFilter = {
            $or: [
                { paymentStatus: "paid" }, // Paiements validés
                { stripeCheckoutSessionId: mongoose.trusted({ $exists: false }) }, // Réservations manuelles (sans Stripe)
                { stripeCheckoutSessionId: null }, // Réservations manuelles (sans Stripe)
            ],
        };

        // Construire toutes les conditions
        const conditions: any[] = [paymentFilter];
        
        if (status) conditions.push({ status });
        if (creationId) {
            // Un id invalide ne correspond à aucune commande
            if (!mongoose.isValidObjectId(creationId)) {
                return NextResponse.json({ reservations: [], page, totalPages: 0, total: 0 });
            }
            // $match d'agrégation : pas de conversion automatique en ObjectId
            conditions.push({ creationId: new mongoose.Types.ObjectId(creationId) });
        }
        
        if (search) {
            const regex = mongoose.trusted({ $regex: escapeRegex(search), $options: "i" });
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

        // Commandes correspondantes, de la plus récente à la plus ancienne
        const [result] = await Reservation.aggregate([
            { $match: query },
            {
                $group: {
                    _id: { $ifNull: ["$stripeCheckoutSessionId", { $toString: "$_id" }] },
                    lastCreatedAt: { $max: "$createdAt" },
                },
            },
            { $sort: { lastCreatedAt: -1, _id: -1 } },
            {
                $facet: {
                    total: [{ $count: "count" }],
                    keys: [{ $skip: (page - 1) * limit }, { $limit: limit }],
                },
            },
        ]);
        const total: number = result.total[0]?.count ?? 0;
        const keys: string[] = result.keys.map((k: { _id: string }) => k._id);

        // Tous les articles (visibles) de ces commandes, même ceux hors filtre
        const reservations = keys.length === 0 ? [] : await Reservation.find({
            $and: [
                paymentFilter,
                {
                    $or: [
                        { stripeCheckoutSessionId: mongoose.trusted({ $in: keys }) },
                        { _id: mongoose.trusted({ $in: keys.filter((k) => mongoose.isValidObjectId(k)) }) },
                    ],
                },
            ],
        })
            .sort({ createdAt: -1 })
            .populate("creationId")
            .lean();

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

/**
 * POST /api/admin/reservations
 * Créer une ou plusieurs réservations depuis l'admin
 */
export async function POST(req: Request) {
    try {
        const session = await checkAdminAuth();
        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        await connectToDatabase();

        const body = await req.json();
        const { userId, creationIds, name, contact, message, status = "preparing" } = body;

        // Validation
        if (!userId) {
            return NextResponse.json(
                { error: "L'utilisateur est requis" },
                { status: 400 }
            );
        }

        if (!creationIds || !Array.isArray(creationIds) || creationIds.length === 0) {
            return NextResponse.json(
                { error: "Au moins une création est requise" },
                { status: 400 }
            );
        }

        // Vérifier que l'utilisateur existe
        const user = await User.findById(userId);
        if (!user) {
            return NextResponse.json(
                { error: "Utilisateur introuvable" },
                { status: 404 }
            );
        }

        // Vérifier que les créations existent
        const creations = await Creation.find({ _id: mongoose.trusted({ $in: creationIds }) });
        if (creations.length !== creationIds.length) {
            return NextResponse.json(
                { error: "Certaines créations n'existent pas" },
                { status: 404 }
            );
        }

        // Plus de vérification de réservation nécessaire - toutes les créations peuvent être commandées

        // Utiliser le nom et contact de l'utilisateur si non fournis
        const reservationName = name || user.name || user.email;
        const reservationContact = contact || user.email;

        // Générer un identifiant unique pour cette commande admin (pour grouper les réservations)
        // Format: admin_ + timestamp + random pour garantir l'unicité
        const adminOrderId = `admin_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

        // Créer les réservations
        const reservations = [];
        const now = new Date();

        for (const creation of creations) {
            const reservation = await Reservation.create({
                creationId: creation._id,
                userId: user._id,
                name: reservationName,
                contact: reservationContact,
                userEmail: user.email,
                message: message || "",
                status: status,
                paymentStatus: "paid", // Les commandes admin sont considérées comme payées
                price: creation.price, // Prix figé (stats), obligatoire sur une création
                paidAt: now,
                seenByAdmin: true, // Déjà vue par l'admin
                stripeCheckoutSessionId: adminOrderId, // Utiliser un ID unique pour grouper les réservations de cette commande
            });

            // Marquer la création comme réservée ET vendue (puisque créée par l'admin)
            // Si la création est déjà vendue, on ne réincrémente pas salesCount
            const updateData: any = {
                $set: {
                    reserved: true,
                    reservedName: reservationName,
                    reservedContact: reservationContact,
                    reservedMessage: message || "",
                    reservedAt: now,
                    // La commande détient la pièce : son annulation pourra la remettre en vente
                    reservedByReservationId: reservation._id,
                    sold: true,
                },
            };

            // Incrémenter salesCount seulement si pas déjà vendu
            if (!creation.sold) {
                updateData.$inc = {
                    salesCount: 1,
                };
            }

            await Creation.findByIdAndUpdate(creation._id, updateData);

            reservations.push(reservation);
        }

        // 🔄 Invalider le cache après création des ventes
        revalidateCatalog();

        return NextResponse.json({
            message: `${reservations.length} réservation(s) créée(s) avec succès`,
            reservations,
        }, { status: 201 });
    } catch (err) {
        console.error("Erreur POST /api/admin/reservations:", err);
        return NextResponse.json(
            { error: "Erreur serveur" },
            { status: 500 }
        );
    }
}