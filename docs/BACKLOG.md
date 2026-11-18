# Backlog

Chantiers identifiés et non encore réalisés. Une fois le dépôt public, chaque entrée deviendra une
issue GitHub (le lien sera ajouté ici).

## Migration Auth.js v5 (next-auth 4 → 5)

- **Pourquoi :** next-auth 4 est en maintenance. Il crée un cookie CSRF par requête sans cookie et
  signale un refus CSRF par `ok: true` / `error: null` ; ces deux comportements sont à l'origine de
  l'anomalie [ANO-2026-11-01](anomalies/2026-11-login-csrf.md). Auth.js v5 est conçu pour l'App
  Router (fonction `auth()` unique côté serveur, actions serveur, CSRF intégré).
- **Périmètre :**
  - `app/api/auth/[...nextauth]/` → configuration `auth.ts` (`NextAuth()` exportant `auth`,
    `handlers`, `signIn`, `signOut`) ;
  - remplacer `getServerSession(authOptions)` par `auth()` (pages, routes, `lib/auth.ts`) ;
  - adaptateur `@auth/mongodb-adapter` (déjà compatible), providers Google et Credentials ;
  - callbacks `jwt` / `session` (rôle, révocation après changement de mot de passe, pré-prise de
    contrôle) et leurs tests ;
  - variables : `AUTH_SECRET` (déjà utilisée), `AUTH_URL` / `AUTH_TRUST_HOST` à la place de
    `NEXTAUTH_URL` ;
  - noms des cookies (`authjs.*`) : toutes les sessions en cours seront déconnectées au déploiement.
- **Critères d'acceptation :** tests unitaires à 100 %, `test:e2e` et `test:e2e:stripe` verts ;
  test e2e du jeton CSRF falsifié conservé ; connexion Google vérifiée sur une preview.
- **Taille :** une PR dédiée, plusieurs jours.

## Montée vers vitest 5

- **Pourquoi :** vulnérabilités critiques et hautes dans l'outillage de test (`vitest`,
  `tinypool`, `picomatch`…), non déployé en production.
- **Étapes :**
  1. Monter `vitest` et `@vitest/coverage-v8` ensemble en 5.x, en lisant les guides de migration
     v4 et v5.
  2. Vérifier `vitest.config.ts` : `restoreMocks`, `globalSetup` (MongoDB en mémoire),
     `coverage.include` et seuil à 100 %.
  3. Relancer `test:coverage` et vérifier que le seuil de 100 % tient toujours.
  4. Lancer `npm audit fix` (sans `--force`) pour `vite`, `zod`, `brace-expansion` et
     `typescript-eslint`, en vérifiant qu'aucune version majeure ne bouge.
- **Reste hors de portée :** la chaîne `eslint-config-next` → `fast-glob` / `micromatch`, sans
  correctif publié par Next.js. Risque accepté : outillage de lint, jamais exécuté en production.

## Durcissements de sécurité (audit de pré-publication, option 2)

- Validation centralisée des entrées (zod) et `sanitizeFilter` de Mongoose.
- Mots de passe de 12 caractères minimum, limite de connexion par compte, connexion Google
  obligatoire pour les administrateurs, coût bcrypt à 12.
- Journal d'audit des actions admin et des échecs de connexion.
- Détail : [`docs/SECURITY.md`](SECURITY.md), section « Limites connues ».

## Boucle de rechargements en développement (Turbopack, Next 16.4.6)

- Anomalie ANO-2026-11-02, décrite dans la [fiche d'anomalie](anomalies/2026-11-login-csrf.md#9-anomalie-liée--ano-2026-11-02--boucle-de-rechargements-en-développement).
- Suivre les versions suivantes de Next.js et retirer le contournement retenu dès qu'une version
  corrige le défaut.
