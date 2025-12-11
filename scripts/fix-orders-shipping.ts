// /**
//  * Script pour corriger les commandes existantes :
//  * - Met à jour le deliveryMode depuis les metadata Stripe si disponible
//  * - Ajoute les frais de livraison pour les commandes en mode "shipping"
//  */

// import mongoose from "mongoose";
// import Reservation from "../models/Reservation";
// import Settings from "../models/Settings";
// import Stripe from "stripe";

// const MONGODB_URI = process.env.MONGODB_URI;
// const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

// if (!MONGODB_URI) {
//   console.error("MONGODB_URI n'est pas défini");
//   process.exit(1);
// }

// if (!STRIPE_SECRET_KEY) {
//   console.error("STRIPE_SECRET_KEY n'est pas défini");
//   process.exit(1);
// }

// const stripe = new Stripe(STRIPE_SECRET_KEY, {
//   apiVersion: "2025-11-17.clover",
// });

// async function fixOrders() {
//   try {
//     await mongoose.connect(MONGODB_URI);
//     console.log("✅ Connecté à MongoDB");

//     // Récupérer les frais de livraison depuis les settings
//     const settings = await Settings.findById("main");
//     const shippingCost = settings?.shippingCost ?? 5;

//     // Trouver toutes les commandes payées
//     const reservations = await Reservation.find({
//       paymentStatus: "paid",
//     }).populate("creationId");

//     console.log(`📦 Trouvé ${reservations.length} commandes payées`);

//     let updated = 0;
//     let skipped = 0;

//     // Grouper par session Stripe
//     const bySession = new Map<string, typeof reservations>();
//     for (const res of reservations) {
//       const sessionId = (res as any).stripeCheckoutSessionId;
//       if (sessionId) {
//         if (!bySession.has(sessionId)) {
//           bySession.set(sessionId, []);
//         }
//         bySession.get(sessionId)!.push(res);
//       }
//     }

//     // Traiter chaque session
//     for (const [sessionId, items] of bySession) {
//       try {
//         // Récupérer la session Stripe pour obtenir les metadata
//         const session = await stripe.checkout.sessions.retrieve(sessionId);
//         const deliveryMode = session.metadata?.deliveryMode || "pickup";
//         const totalShippingCost = session.metadata?.shippingCost
//           ? parseFloat(session.metadata.shippingCost)
//           : 0;
//         const shippingPerItem = totalShippingCost / items.length;

//         let needsUpdate = false;

//         // Vérifier si une mise à jour est nécessaire
//         for (const item of items) {
//           if (
//             (item as any).deliveryMode !== deliveryMode ||
//             ((item as any).shippingCost === 0 && deliveryMode === "shipping" && totalShippingCost > 0)
//           ) {
//             needsUpdate = true;
//             break;
//           }
//         }

//         if (needsUpdate) {
//           // Mettre à jour tous les articles de cette commande
//           for (const item of items) {
//             (item as any).deliveryMode = deliveryMode;
//             if (deliveryMode === "shipping" && totalShippingCost > 0) {
//               (item as any).shippingCost = shippingPerItem;
//             } else {
//               (item as any).shippingCost = 0;
//             }
//             await item.save();
//           }
//           updated += items.length;
//           console.log(
//             `✅ Mis à jour la commande ${sessionId} (${items.length} articles) - Mode: ${deliveryMode}, Frais: ${totalShippingCost}€`
//           );
//         } else {
//           skipped += items.length;
//         }
//       } catch (err: any) {
//         console.error(`❌ Erreur pour la session ${sessionId}:`, err.message);
//       }
//     }

//     // Traiter les commandes sans session Stripe (anciennes)
//     const withoutSession = reservations.filter(
//       (r) => !(r as any).stripeCheckoutSessionId
//     );

//     if (withoutSession.length > 0) {
//       console.log(
//         `\n⚠️  ${withoutSession.length} commandes sans session Stripe (anciennes)`
//       );
//     }

//     console.log(`\n✅ Terminé !`);
//     console.log(`   - ${updated} articles mis à jour`);
//     console.log(`   - ${skipped} articles déjà corrects`);
//     console.log(`   - ${withoutSession.length} commandes anciennes (non modifiées)`);

//     await mongoose.disconnect();
//     process.exit(0);
//   } catch (err) {
//     console.error("❌ Erreur:", err);
//     await mongoose.disconnect();
//     process.exit(1);
//   }
// }

// fixOrders();
