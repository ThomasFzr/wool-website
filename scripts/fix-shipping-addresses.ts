// /**
//  * Script pour récupérer et corriger les adresses de livraison manquantes
//  * depuis les sessions Stripe pour les commandes existantes
//  */

// import { config } from "dotenv";
// import { resolve } from "path";

// // Charger les variables d'environnement depuis .env.local
// config({ path: resolve(process.cwd(), ".env.local") });
// config({ path: resolve(process.cwd(), ".env") });

// import mongoose from "mongoose";
// import Reservation from "../models/Reservation";
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

// async function fixShippingAddresses() {
//   try {
//     await mongoose.connect(MONGODB_URI);
//     console.log("✅ Connecté à MongoDB");

//     // Trouver toutes les commandes payées en mode shipping sans adresse
//     const reservations = await Reservation.find({
//       paymentStatus: "paid",
//       deliveryMode: "shipping",
//       $or: [
//         { shippingAddress: { $exists: false } },
//         { shippingAddress: null },
//         { "shippingAddress.name": { $exists: false } },
//         { "shippingAddress.line1": { $exists: false } },
//       ],
//     });

//     console.log(`📦 Trouvé ${reservations.length} commandes sans adresse complète`);

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

//     let updated = 0;
//     let notFound = 0;
//     let noAddress = 0;

//     // Traiter chaque session
//     for (const [sessionId, items] of bySession) {
//       try {
//         console.log(`\n🔍 Traitement de la session: ${sessionId}`);
        
//         // Récupérer la session Stripe
//         const session = await stripe.checkout.sessions.retrieve(sessionId);
        
//         // Récupérer l'adresse depuis shipping_details ou shipping
//         const shippingInfo = (session as any).shipping_details || (session as any).shipping;
        
//         if (!shippingInfo || !shippingInfo.address) {
//           console.log(`   ⚠️  Pas d'adresse dans la session Stripe`);
//           noAddress += items.length;
//           continue;
//         }

//         const shippingAddress = {
//           name: shippingInfo.name || "",
//           line1: shippingInfo.address.line1 || "",
//           line2: shippingInfo.address.line2 || "",
//           city: shippingInfo.address.city || "",
//           postalCode: shippingInfo.address.postal_code || "",
//           country: shippingInfo.address.country || "",
//         };

//         // Vérifier que l'adresse est valide
//         if (!shippingAddress.line1 || !shippingAddress.city) {
//           console.log(`   ⚠️  Adresse incomplète dans Stripe`);
//           noAddress += items.length;
//           continue;
//         }

//         // Mettre à jour tous les articles de cette commande
//         for (const item of items) {
//           (item as any).shippingAddress = shippingAddress;
//           await item.save();
//         }
        
//         updated += items.length;
//         console.log(`   ✅ Adresse récupérée et sauvegardée pour ${items.length} article(s)`);
//         console.log(`      ${shippingAddress.name}`);
//         console.log(`      ${shippingAddress.line1}`);
//         if (shippingAddress.line2) console.log(`      ${shippingAddress.line2}`);
//         console.log(`      ${shippingAddress.postalCode} ${shippingAddress.city}`);
//         console.log(`      ${shippingAddress.country}`);
//       } catch (err: any) {
//         console.error(`   ❌ Erreur pour la session ${sessionId}:`, err.message);
//         if (err.code === "resource_missing") {
//           notFound += items.length;
//         }
//       }
//     }

//     // Traiter les commandes sans session Stripe
//     const withoutSession = reservations.filter(
//       (r) => !(r as any).stripeCheckoutSessionId
//     );

//     if (withoutSession.length > 0) {
//       console.log(
//         `\n⚠️  ${withoutSession.length} commandes sans session Stripe (impossible de récupérer l'adresse)`
//       );
//     }

//     console.log(`\n✅ Terminé !`);
//     console.log(`   - ${updated} articles mis à jour avec une adresse`);
//     console.log(`   - ${noAddress} articles sans adresse disponible dans Stripe`);
//     console.log(`   - ${notFound} articles avec session Stripe introuvable`);
//     console.log(`   - ${withoutSession.length} commandes sans session Stripe`);

//     await mongoose.disconnect();
//     process.exit(0);
//   } catch (err) {
//     console.error("❌ Erreur:", err);
//     await mongoose.disconnect();
//     process.exit(1);
//   }
// }

// fixShippingAddresses();
