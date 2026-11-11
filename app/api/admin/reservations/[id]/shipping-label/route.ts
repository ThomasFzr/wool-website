import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import { checkAdminAuth } from "@/lib/auth";

type AdminRouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Génère un bordereau d'envoi La Poste au format texte
 */
export async function GET(req: NextRequest, context: AdminRouteContext) {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await connectToDatabase();

    const { id } = await context.params;
    const reservation = await Reservation.findById(id).populate("creationId");

    if (!reservation) {
      return new NextResponse("Commande non trouvée", { status: 404 });
    }

    // Vérifier que c'est une commande avec livraison
    if (reservation.deliveryMode !== "shipping") {
      return new NextResponse("Cette commande n'est pas en mode livraison", { status: 400 });
    }

    // Récupérer tous les articles de la commande (même session Stripe)
    const sessionId = (reservation as any).stripeCheckoutSessionId;
    const allReservations = sessionId
      ? await Reservation.find({ stripeCheckoutSessionId: sessionId }).populate("creationId")
      : [reservation];

    // Chercher l'adresse de livraison (peut être sur n'importe quel article de la commande)
    // Mongoose renvoie toujours un objet pour ce chemin imbriqué, même vide : tester son contenu
    const ADDRESS_FIELDS = ["name", "line1", "line2", "postalCode", "city", "country"];
    const hasAddress = (r: any) => ADDRESS_FIELDS.some((field) => r.shippingAddress[field]);
    const addr = [reservation, ...allReservations].find(hasAddress)?.shippingAddress;

    // Récupérer l'adresse de l'expéditeur depuis les variables d'environnement ou utiliser des valeurs par défaut
    const senderName = process.env.SHIPPING_SENDER_NAME || "MailleMum";
    const senderAddress = process.env.SHIPPING_SENDER_ADDRESS || "";
    const senderCity = process.env.SHIPPING_SENDER_CITY || "";
    const senderPostalCode = process.env.SHIPPING_SENDER_POSTAL_CODE || "";
    const senderCountry = process.env.SHIPPING_SENDER_COUNTRY || "France";

    // Formater l'adresse du destinataire
    let recipientAddress = "Adresse non disponible";
    if (addr) {
      const parts = [];
      if (addr.name) parts.push(addr.name);
      if (addr.line1) parts.push(addr.line1);
      if (addr.line2) parts.push(addr.line2);
      const cityLine = [addr.postalCode, addr.city].filter(Boolean).join(" ");
      if (cityLine) parts.push(cityLine);
      if (addr.country) parts.push(addr.country);
      recipientAddress = parts.join("\n");
    }

    // Générer le bordereau au format texte
    const label = `
═══════════════════════════════════════════════════════════
                    BORDEREAU D'ENVOI - LA POSTE
═══════════════════════════════════════════════════════════

📦 EXPÉDITEUR :
${senderName}
${senderAddress}
${senderPostalCode} ${senderCity}
${senderCountry}

📬 DESTINATAIRE :
${recipientAddress}

═══════════════════════════════════════════════════════════

📋 CONTENU DU COLIS :
${allReservations.map((r: any) => {
      const c = r.creationId;
      if (!c) return "Article supprimé";
      return `${c.title || "Article"}${c.color ? ` - ${c.color}` : ""}${c.price ? ` (${c.price} €)` : ""}`;
    }).join("\n")}

📅 DATE D'EXPÉDITION : ${new Date().toLocaleDateString("fr-FR")}
${reservation.trackingNumber ? `🔢 NUMÉRO DE SUIVI : ${reservation.trackingNumber}` : ""}

═══════════════════════════════════════════════════════════
COMMANDE N° : ${reservation._id.toString().slice(-8)}
═══════════════════════════════════════════════════════════
`;

    // Retourner le bordereau en texte
    return new NextResponse(label, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="bordereau-${reservation._id.toString().slice(-8)}.txt"`,
      },
    });
  } catch (err: any) {
    console.error("Erreur lors de la génération du bordereau:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
