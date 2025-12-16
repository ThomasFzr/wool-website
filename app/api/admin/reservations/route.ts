import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import Creation from "@/models/Creation";
import User from "@/models/User";
import "@/models/Creation";
import { checkAdminAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

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
        const creations = await Creation.find({ _id: { $in: creationIds } });
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
        revalidatePath('/');
        revalidatePath('/api/creations');

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