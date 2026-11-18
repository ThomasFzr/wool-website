# MailleMum

Boutique en ligne de créations en laine faites main, en production sur
[maillemum.fr](https://www.maillemum.fr).

Chaque création est une **pièce unique** : le site gère la réservation d'un article pendant le
paiement, le paiement en ligne par Stripe, le suivi des commandes jusqu'à l'expédition, et un
backoffice complet pour la vendeuse.

Projet réalisé seul, de la conception à la mise en production : V1 fin 2025, V2 en 2026
(refonte du paiement, sécurité, tests automatisés). Le détail de la revue et des corrections de
la V2 est dans [`docs/revue-2026-11.md`](docs/revue-2026-11.md).

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Stack technique](#stack-technique)
- [Architecture](#architecture)
- [Installation](#installation)
- [Variables d'environnement](#variables-denvironnement)
- [Tests](#tests)
- [Déploiement](#déploiement)
- [Sécurité](#sécurité)
- [Licence](#licence)

---

## Fonctionnalités

### Visiteurs et clients
- Catalogue filtrable (type, couleur, disponibilité), fiche produit avec galerie (zoom, glisser au doigt).
- Panier, choix entre livraison et retrait sur place (selon le code postal).
- Paiement par **Stripe Checkout** ; la pièce est verrouillée le temps du paiement puis marquée vendue.
- Compte : connexion par email et mot de passe ou par **Google**, mot de passe oublié, historique
  des commandes, préférences de notification.
- Emails transactionnels : confirmation de commande, validation, expédition (avec numéro de
  suivi), annulation, remboursement.
- Formulaire de contact protégé contre le spam.

### Backoffice (rôle `admin`)
- Créations : ajout, modification, masquage, réordonnancement par glisser-déposer, envoi de photos
  vers Cloudinary, slug et métadonnées SEO, description générée par IA (Google Gemini).
- Commandes : recherche, actions groupées par commande, statuts (validée, expédiée, livrée,
  annulée), étiquette d'expédition, saisie manuelle d'une vente.
- Utilisateurs (rôles), messages de contact, statistiques de ventes, réglages du site (textes,
  couleurs, types, frais de port, conditions de retrait).

---

## Stack technique

| Domaine | Choix |
|---|---|
| Framework | **Next.js 16** (App Router, Server Components, route handlers), **React 19**, **TypeScript** |
| Style | Tailwind CSS 4 |
| Données | **MongoDB Atlas** avec **Mongoose** |
| Authentification | **next-auth 4** (JWT), providers Credentials (bcrypt) et Google, adaptateur MongoDB |
| Paiement | **Stripe** Checkout + webhooks signés |
| Images | Cloudinary (envois signés côté serveur) |
| Emails | Resend |
| IA | Google Gemini (descriptions produit) |
| Hébergement | **Vercel** (fonctions Node.js, cron, analytics) |
| Tests | **Vitest** (unitaires, 100 % de couverture de la logique), **Playwright** (e2e), mongodb-memory-server |

---

## Architecture

```
app/
├── page.tsx, creations/[id]/     Catalogue et fiche produit (rendu serveur, ISR)
├── cart/, checkout/              Panier, retour de paiement
├── account/, login/, …           Espace client et authentification
├── admin/                        Backoffice (garde serveur sur le rôle admin)
└── api/                          Route handlers
    ├── auth/                     next-auth, inscription, mot de passe oublié
    ├── stripe/                   Création de session, vérification, annulation, webhook
    ├── admin/                    API du backoffice (toutes protégées par checkAdminAuth)
    ├── creations/, contact/, …   API publiques
    └── cron/release-locks/       Libération des pièces restées verrouillées (cron Vercel)
components/                       Composants React (ui/ = composants de base, admin/)
contexts/CartContext.tsx          État du panier (localStorage + revérification serveur)
hooks/                            Upload d'images, glisser-déposer, articles liés…
lib/                              Logique métier et intégrations
├── checkout-fulfillment.ts       Traitement d'un paiement (idempotent, webhook + retour client)
├── creation-lock.ts              Verrou des pièces uniques pendant le paiement
├── auth.ts, rate-limit.ts        Contrôle d'accès admin, limites de débit partagées (MongoDB)
├── sanitize.ts, escape.ts        Nettoyage HTML, échappement (XSS, injection regex)
└── stripe.ts, cloudinary.ts, sendEmail.ts, gemini.ts …
models/                           Schémas Mongoose (User, Creation, Reservation, Settings…)
scripts/                          Scripts de maintenance (npm run …)
tests/                            unit/ (Vitest), e2e/ (faux Stripe), e2e-stripe/ (Stripe test)
docs/                             Revue de code, sécurité
```

**Parcours d'achat.** `POST /api/stripe/create-checkout-session` relit les prix en base (jamais
ceux du client), verrouille chaque pièce de façon atomique et crée la session Stripe. Le paiement
est confirmé par le **webhook** `checkout.session.completed` (signature vérifiée) ou par le retour
du client sur `/checkout/success` : les deux passent par `lib/checkout-fulfillment.ts`, idempotent.
Une session expirée ou annulée libère la pièce ; un cron quotidien rattrape les verrous oubliés.
Un remboursement fait depuis Stripe (`charge.refunded`) remet la pièce en vente.

---

## Installation

Prérequis : **Node.js ≥ 20.9** (24 recommandé), **MongoDB** en local
(`brew install mongodb-community` puis `brew services start mongodb-community`, ou Docker),
la [CLI Stripe](https://docs.stripe.com/stripe-cli) pour recevoir les webhooks en local.

```bash
git clone https://github.com/ThomasFzr/wool-website.git
cd wool-website
npm install                 # active aussi le hook pre-push (.githooks)
cp .env.example .env.local  # puis remplir les valeurs (voir ci-dessous)
npm run init-settings       # crée les réglages par défaut du site
npm run dev                 # http://localhost:3000
```

Pour recevoir les webhooks Stripe en local, dans un second terminal :

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

En local, les emails ne sont pas envoyés : ils sont capturés et consultables sur
`http://localhost:3000/dev/emails` (`EMAIL_TRANSPORT=resend` pour les envoyer vraiment).

**Créer un administrateur.** Il n'existe aucun compte admin par défaut. Créer un compte sur le
site, puis lui donner le rôle en base :

```javascript
db.users.updateOne({ email: "vous@exemple.fr" }, { $set: { role: "admin" } })
```

### Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` / `build` / `start` | Développement, build de production, serveur de production |
| `npm run lint` / `typecheck` | ESLint, vérification TypeScript |
| `npm test` / `test:coverage` | Tests unitaires (couverture exigée : 100 %) |
| `npm run test:e2e` | Tests de bout en bout sur faux Stripe |
| `npm run test:e2e:stripe` | Tests de bout en bout sur le vrai Stripe (mode test) |
| `npm run init-settings` | Réglages par défaut du site |
| `npm run generate-slugs` | Génère les slugs manquants des créations |
| `npm run sync-users` | Synchronise les comptes next-auth et la collection `users` |

---

## Variables d'environnement

La liste complète, commentée, est dans [`.env.example`](.env.example). Les principales :

| Variable | Rôle |
|---|---|
| `MONGODB_URI` | Base MongoDB (en local : `mongodb://localhost:27017/wool-starter-dev`) |
| `AUTH_SECRET`, `NEXTAUTH_URL` | Signature des sessions, URL vue par next-auth |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Connexion Google |
| `NEXT_PUBLIC_APP_URL` | URL publique utilisée dans les emails |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Paiement et vérification des webhooks |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Images |
| `RESEND_API_KEY`, `EMAIL_FROM`, `SELLER_EMAIL` | Emails |
| `GEMINI_API_KEY` | Descriptions générées par IA (facultatif) |
| `CRON_SECRET` | Authentifie l'appel du cron Vercel |

Règle : **aucune clé de production sur un poste de développement**. En local, uniquement des clés
Stripe de test et une base MongoDB locale.

---

## Tests

- **Unitaires et intégration (Vitest)** — `tests/unit/`, environ 1 000 tests sur les routes API,
  la logique métier, les modèles, les hooks et le contexte du panier, avec une MongoDB en mémoire.
  La couverture de la logique (`app/api`, `lib`, `models`, `hooks`, `contexts`) est exigée à
  **100 %** (`npm run test:coverage` échoue sinon).
- **Bout en bout (Playwright)** — `tests/e2e/` : le site est lancé sur une MongoDB en mémoire
  préremplie (`tests/e2e/server/seed.ts`) et un faux Stripe ; parcours connexion, compte, panier,
  paiement, backoffice.
- **Paiement réel (Playwright + Stripe test)** — `tests/e2e-stripe/` : vraie page Stripe
  Checkout, webhooks relayés par la CLI Stripe. Prérequis : `stripe` installée et
  `.env.stripe-test.local` contenant `STRIPE_SECRET_KEY=sk_test_…`.
- **Intégration continue** — `.github/workflows/tests.yml` lance lint, typecheck, tests unitaires
  et e2e à chaque push et pull request ; le hook `pre-push` lance les mêmes contrôles en local.
  Dependabot surveille les dépendances.

---

## Déploiement

Le site est déployé sur **Vercel** : chaque pull request crée une preview (protégée par Vercel
Authentication), chaque fusion sur `main` déploie la production.

1. **Variables** : définir celles de `.env.example` dans Vercel → Settings → Environment
   Variables, en type « Sensitive » pour les secrets ; clés Stripe **live** en production
   uniquement.
2. **Webhook Stripe** : Stripe → Développeurs → Webhooks → endpoint
   `https://<domaine>/api/stripe/webhook`, abonné à :
   - `checkout.session.completed` (paiement confirmé),
   - `checkout.session.expired` (libération de la pièce),
   - `charge.refunded` (remboursement fait depuis Stripe).

   Copier son secret de signature dans `STRIPE_WEBHOOK_SECRET`.
3. **Cron** : `vercel.json` appelle `/api/cron/release-locks` chaque jour à 4 h UTC. Définir
   `CRON_SECRET` : Vercel l'envoie en `Authorization: Bearer`, la route refuse tout autre appel.
4. **Google OAuth** : ajouter `https://<domaine>/api/auth/callback/google` aux URI de redirection.
5. **MongoDB Atlas** : autoriser l'accès depuis Vercel (Network Access).

---

## Sécurité

Le projet suit l'**OWASP Top 10** : contrôle d'accès vérifié côté serveur sur chaque route admin,
mots de passe hachés (bcrypt), limites de débit sur la connexion et l'inscription, webhooks
Stripe signés, envois d'images signés, nettoyage du HTML, en-têtes de sécurité (CSP, HSTS…),
dépendances surveillées.

Le détail par catégorie, avec les liens vers le code et les tests, est dans
**[`docs/SECURITY.md`](docs/SECURITY.md)**.

---

## Licence

**Tous droits réservés.** Le code est public pour consultation uniquement ; toute réutilisation
est interdite sans autorisation écrite. Voir [`LICENSE`](LICENSE).

## Auteur

Thomas Foltzer — [@ThomasFzr](https://github.com/ThomasFzr)
