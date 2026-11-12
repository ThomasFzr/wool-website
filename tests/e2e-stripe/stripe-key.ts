import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { STRIPE_TEST_ENV_FILE } from "./data";

/**
 * Lit la clé secrète Stripe de TEST. Refuse toute autre clé : cette suite crée des
 * paiements et des remboursements, elle ne doit jamais viser le compte live.
 */
export function readStripeTestKey(): string {
  const file = path.join(process.cwd(), STRIPE_TEST_ENV_FILE);
  if (!fs.existsSync(file)) {
    throw new Error(
      `${STRIPE_TEST_ENV_FILE} introuvable : y mettre STRIPE_SECRET_KEY=sk_test_… (Stripe, mode test → Developers → API keys)`
    );
  }
  const key = dotenv.parse(fs.readFileSync(file)).STRIPE_SECRET_KEY?.trim() ?? "";
  if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
    throw new Error(
      `STRIPE_SECRET_KEY de ${STRIPE_TEST_ENV_FILE} n'est pas une clé de test (sk_test_…) : arrêt.`
    );
  }
  return key;
}
