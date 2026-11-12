import { spawn, spawnSync, type ChildProcess } from "child_process";
import http from "http";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import Settings from "@/models/Settings";
import { seed } from "../../e2e/server/seed";
import { STRIPE_E2E_APP_PORT, STRIPE_E2E_APP_URL, STRIPE_E2E_CONTROL_PORT } from "../data";
import { readStripeTestKey } from "../stripe-key";

/**
 * Serveur de la suite e2e « vrai Stripe » (lancé par playwright.stripe.config.ts) :
 * MongoDB en mémoire préremplie + `stripe listen` (vrais webhooks du compte de test)
 * + `next dev` branché sur Stripe en mode test.
 *
 * Seule la clé Stripe est réelle (et forcément de test) : base, emails, Google,
 * Cloudinary et Gemini sont neutralisés comme dans tests/e2e.
 *
 * Routes de pilotage (port de contrôle) :
 *   POST /__e2e/reset          remet la base dans son état initial
 *   GET  /__e2e/reservations   réservations en base
 *   GET  /__e2e/creations      créations en base
 *   POST /__e2e/settings       fusionne le JSON reçu dans les réglages
 */
async function main() {
  const stripeKey = readStripeTestKey();

  const mongod = await MongoMemoryServer.create();
  const mongoUri = mongod.getUri("maillemum-e2e-stripe");
  await mongoose.connect(mongoUri);
  await seed();

  // Secret de signature des événements relayés par `stripe listen`
  const secret = spawnSync("stripe", ["listen", "--api-key", stripeKey, "--print-secret"], {
    encoding: "utf8",
  });
  const webhookSecret = secret.stdout.trim();
  if (secret.status !== 0 || !webhookSecret.startsWith("whsec_")) {
    throw new Error(`stripe listen --print-secret a échoué : ${secret.stderr || secret.stdout}`);
  }

  const children: ChildProcess[] = [];
  const listen = spawn(
    "stripe",
    [
      "listen",
      "--api-key",
      stripeKey,
      "--events",
      "checkout.session.completed,checkout.session.expired,charge.refunded",
      "--forward-to",
      `${STRIPE_E2E_APP_URL}/api/stripe/webhook`,
    ],
    { stdio: ["ignore", "inherit", "inherit"] }
  );
  children.push(listen);

  const control = http.createServer(async (req, res) => {
    try {
      const route = `${req.method} ${req.url}`;
      if (route === "POST /__e2e/reset") {
        await seed();
        return json(res, 200, { ok: true });
      }
      if (route === "GET /__e2e/reservations") {
        return json(res, 200, await Reservation.find().sort({ createdAt: -1 }).lean());
      }
      if (route === "GET /__e2e/creations") {
        return json(res, 200, await Creation.find().lean());
      }
      if (route === "POST /__e2e/settings") {
        const patch = JSON.parse((await readBody(req)) || "{}");
        await Settings.updateOne({ _id: "main" }, { $set: patch });
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: `Route inconnue : ${route}` });
    } catch (err) {
      console.error("[e2e-stripe] contrôle :", err);
      return json(res, 500, { error: err instanceof Error ? err.message : "Erreur" });
    }
  });
  await new Promise<void>((resolve) => control.listen(STRIPE_E2E_CONTROL_PORT, resolve));

  const next = spawn(
    "npx",
    ["next", "dev", "--port", String(STRIPE_E2E_APP_PORT)],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        MONGODB_URI: mongoUri,
        AUTH_SECRET: "e2e-stripe-secret",
        NEXTAUTH_URL: STRIPE_E2E_APP_URL,
        NEXT_PUBLIC_APP_URL: STRIPE_E2E_APP_URL,
        STRIPE_SECRET_KEY: stripeKey,
        STRIPE_API_BASE_URL: "",
        STRIPE_WEBHOOK_SECRET: webhookSecret,
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
    }
  );
  children.push(next);

  const stop = async () => {
    for (const child of children) child.kill("SIGTERM");
    control.close();
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  next.on("exit", (code) => {
    console.error(`[e2e-stripe] next dev s'est arrêté (code ${code})`);
    void stop();
  });
  listen.on("exit", (code) => {
    console.error(`[e2e-stripe] stripe listen s'est arrêté (code ${code})`);
    void stop();
  });
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function json(res: http.ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

main().catch((err) => {
  console.error("[e2e-stripe] Démarrage impossible :", err);
  process.exit(1);
});
