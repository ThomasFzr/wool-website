import mongoose from "mongoose";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";

/** Crée une création minimale valide. */
export function createCreation(overrides: Record<string, unknown> = {}) {
  return Creation.create({
    title: "Bonnet",
    price: 30,
    color: "Rouge",
    type: "bonnet",
    ...overrides,
  });
}

/** Crée une réservation (payée par défaut) pour l'email donné. */
export function createReservation(overrides: Record<string, unknown> = {}) {
  return Reservation.create({
    name: "Client",
    contact: "client@example.com",
    paymentStatus: "paid",
    ...overrides,
  });
}

export const newId = () => new mongoose.Types.ObjectId();
