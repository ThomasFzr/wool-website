import { spawn } from "child_process";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { startFakeStripe } from "./fake-stripe";
import { seed } from "./seed";
import { E2E_APP_PORT, E2E_STRIPE_PORT, E2E_STRIPE_URL } from "../data";

/**
 * Serveur des tests e2e (lancé par playwright.config.ts) :
 * MongoDB en mémoire préremplie + faux Stripe + `next dev`.
 *
 * Next charge aussi .env.local : TOUTES les variables qui pourraient viser un vrai
 * service (base, Stripe, Resend, Google, Cloudinary, Gemini) sont donc forcées ici,
 * les variables d'environnement du processus ayant priorité sur les fichiers .env.
 */
async function main() {
  const mongod = await MongoMemoryServer.create();
  const mongoUri = mongod.getUri("maillemum-e2e");
  await mongoose.connect(mongoUri);
  await seed();

  const stripeServer = await startFakeStripe(E2E_STRIPE_PORT, seed);
  const appUrl = `http://localhost:${E2E_APP_PORT}`;

  // --webpack : contournement de ANO-2026-11-02 (docs/anomalies/2026-11-login-csrf.md, § 9).
  // Avec Turbopack, Next 16.4.6 peut boucler en rechargements au démarrage à froid (environ
  // 2 démarrages sur 5). À retirer dès qu'une version de Next corrige le défaut (docs/BACKLOG.md).
  const next = spawn("npx", ["next", "dev", "--webpack", "--port", String(E2E_APP_PORT)], {
    stdio: "inherit",
    env: {
      ...process.env,
      MONGODB_URI: mongoUri,
      AUTH_SECRET: "e2e-secret",
      NEXTAUTH_URL: appUrl,
      NEXT_PUBLIC_APP_URL: appUrl,
      STRIPE_SECRET_KEY: "sk_test_e2e",
      STRIPE_API_BASE_URL: E2E_STRIPE_URL,
      STRIPE_WEBHOOK_SECRET: "whsec_e2e",
      // Emails capturés dans .emails/ (jamais envoyés), sans ouvrir de navigateur
      EMAIL_TRANSPORT: "preview",
      EMAIL_PREVIEW_OPEN: "0",
      EMAIL_FROM: "MailleMum <boutique@maillemum.test>",
      SELLER_EMAIL: "vendeuse@maillemum.test",
      RESEND_API_KEY: "re_e2e",
      GOOGLE_CLIENT_ID: "e2e-google-client",
      GOOGLE_CLIENT_SECRET: "e2e-google-secret",
      NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "e2e",
      CLOUDINARY_API_KEY: "e2e",
      CLOUDINARY_API_SECRET: "e2e",
      GEMINI_API_KEY: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });

  const stop = async () => {
    next.kill("SIGTERM");
    stripeServer.close();
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  next.on("exit", (code) => {
    console.error(`[e2e] next dev s'est arrêté (code ${code})`);
    void stop();
  });
}

main().catch((err) => {
  console.error("[e2e] Démarrage impossible :", err);
  process.exit(1);
});
