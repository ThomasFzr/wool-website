import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import Settings from "@/models/Settings";
import User from "@/models/User";
import { E2E_ADMIN, E2E_CLIENT, E2E_CREATIONS, E2E_LEGACY_CLIENT } from "../data";

/** Vide la base e2e et la remplit avec le jeu de données de référence. */
export async function seed() {
  const db = mongoose.connection.db!;
  const collections = await db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));

  const [client] = await User.create([
    {
      ...E2E_CLIENT.profile,
      email: E2E_CLIENT.email,
      password: await bcrypt.hash(E2E_CLIENT.password, 10),
      provider: "credentials",
      role: "user",
    },
    {
      name: E2E_ADMIN.name,
      email: E2E_ADMIN.email,
      password: await bcrypt.hash(E2E_ADMIN.password, 10),
      provider: "credentials",
      role: "admin",
    },
    {
      name: "Ancien Client",
      email: E2E_LEGACY_CLIENT.email,
      password: await bcrypt.hash(E2E_LEGACY_CLIENT.password, 10),
      provider: "credentials",
      role: "user",
    },
  ]);

  await Settings.create({
    _id: "main",
    title: "MailleMum",
    shippingCost: 6,
    pickupConditions: { enabled: false },
  });

  const visibleAt = new Date("2026-01-01T00:00:00Z");
  const creations = await Creation.create(
    Object.values(E2E_CREATIONS).map((c, i) => ({
      color: "Rose",
      type: "bonnet",
      images: [],
      visibleAt,
      displayOrder: 100 - i,
      ...c,
    }))
  );
  const sold = creations.find((c: { slug?: string }) => c.slug === E2E_CREATIONS.sold.slug);

  // Une commande déjà payée par le client, pour la page compte et l'admin
  await Reservation.create({
    creationId: sold._id,
    userId: client._id,
    name: E2E_CLIENT.profile.name,
    contact: E2E_CLIENT.email,
    status: "preparing",
    paymentStatus: "paid",
    paidAt: new Date("2026-10-01T10:00:00Z"),
    deliveryMode: "shipping",
    shippingCost: 6,
    shippingAddress: {
      name: E2E_CLIENT.profile.name,
      line1: "12 rue des Lilas",
      line2: "",
      city: "Paris",
      postalCode: "75011",
      country: "FR",
    },
    stripeCheckoutSessionId: "cs_test_seed_1",
  });
}
