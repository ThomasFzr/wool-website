// Jeu de données partagé entre le serveur e2e (seed) et les tests.

export const E2E_APP_PORT = 3100;
export const E2E_STRIPE_PORT = 3101;
export const E2E_STRIPE_URL = `http://localhost:${E2E_STRIPE_PORT}`;
export const E2E_HIBP_PORT = 3102;
export const E2E_HIBP_URL = `http://localhost:${E2E_HIBP_PORT}`;
/** Secret next-auth du serveur e2e : signe aussi les sessions admin simulées (helpers.loginAsAdmin). */
export const E2E_AUTH_SECRET = "e2e-secret";

/** Message neutre de tout échec de connexion (lib/sign-in-result.ts). */
export const LOGIN_FAILED = "Connexion impossible : vérifiez vos identifiants ou réessayez dans quelques minutes.";

export const E2E_CLIENT = {
  email: "client@maillemum.test",
  password: "Client-e2e-123",
  profile: { name: "Camille Client", postalCode: "75011", city: "Paris" },
};

/** Compte créé sous l'ancienne règle (6 caractères minimum) : mot de passe trop court. */
export const E2E_LEGACY_CLIENT = {
  email: "ancien@maillemum.test",
  password: "chaton",
};

/**
 * Administratrice : connexion Google uniquement (provider credentials refusé). Le mot de
 * passe n'existe que pour prouver ce refus ; les tests admin se connectent par
 * helpers.loginAsAdmin (session Google simulée).
 */
export const E2E_ADMIN = {
  email: "admin@maillemum.test",
  password: "Admin-e2e-123",
  name: "Admin MailleMum",
};

export const E2E_CREATIONS = {
  rose: { title: "Bonnet Mérinos Rose", slug: "bonnet-merinos-rose", price: 40 },
  bleu: { title: "Snood Alpaga Bleu", slug: "snood-alpaga-bleu", price: 35, color: "Bleu", type: "tour de cou" },
  hidden: { title: "Bandeau Brouillon", slug: "bandeau-brouillon", price: 20, hidden: true, type: "bandeau" },
  sold: { title: "Bonnet Déjà Vendu", slug: "bonnet-deja-vendu", price: 45, sold: true, salesCount: 1 },
} as const;
