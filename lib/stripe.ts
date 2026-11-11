import Stripe from "stripe";

let stripe: Stripe | null = null;

// Tests e2e : STRIPE_API_BASE_URL redirige le SDK vers un faux serveur Stripe local.
// Jamais pris en compte en production.
function apiHostOptions(): Pick<Stripe.StripeConfig, "host" | "port" | "protocol"> {
  const base = process.env.STRIPE_API_BASE_URL;
  if (!base || process.env.NODE_ENV === "production") return {};
  const url = new URL(base);
  return {
    host: url.hostname,
    port: url.port,
    protocol: url.protocol === "http:" ? "http" : "https",
  };
}

// Singleton Stripe partagé par toutes les routes (une seule apiVersion épinglée).
export function getStripeInstance(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY n'est pas définie");
  }
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-11-17.clover",
      ...apiHostOptions(),
    });
  }
  return stripe;
}
