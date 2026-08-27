import Stripe from "stripe";

let stripe: Stripe | null = null;

// Singleton Stripe partagé par toutes les routes (une seule apiVersion épinglée).
export function getStripeInstance(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY n'est pas définie");
  }
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-11-17.clover",
    });
  }
  return stripe;
}
