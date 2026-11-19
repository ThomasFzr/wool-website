# Backlog

Chantiers identifiés et non encore réalisés. Chaque entrée a son issue GitHub (lien sous le
titre) : le suivi se fait dans l'issue, ce fichier garde le contexte.

## Migration Auth.js v5 (next-auth 4 → 5)

Issue : [#19](https://github.com/ThomasFzr/wool-website/issues/19)

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

Issue : [#20](https://github.com/ThomasFzr/wool-website/issues/20)

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

Issue : [#21](https://github.com/ThomasFzr/wool-website/issues/21)

- Validation centralisée des entrées (zod) et `sanitizeFilter` de Mongoose.
- Mots de passe de 12 caractères minimum, limite de connexion par compte, connexion Google
  obligatoire pour les administrateurs, coût bcrypt à 12.
- Journal d'audit des actions admin et des échecs de connexion.
- Détail : [`docs/SECURITY.md`](SECURITY.md), section « Limites connues ».

## Boucle de rechargements en développement (Turbopack, Next 16.4.6)

Issue : [#22](https://github.com/ThomasFzr/wool-website/issues/22)

- Anomalie ANO-2026-11-02, décrite dans la [fiche d'anomalie](anomalies/2026-11-login-csrf.md#9-anomalie-liée--ano-2026-11-02--boucle-de-rechargements-en-développement).
- Contournement en place : les serveurs e2e lancent `next dev --webpack`
  (`tests/e2e/server/start.ts`, `tests/e2e-stripe/server/start.ts`).
- **À faire :** suivre l'issue ouverte chez Next.js ; dès qu'une version corrige le défaut, la
  mettre à jour, retirer `--webpack` des deux fichiers, puis relancer `test:e2e` et
  `test:e2e:stripe` plusieurs fois à froid pour vérifier l'absence de boucle.

## Fiabiliser test:e2e:stripe

Issue : [#23](https://github.com/ThomasFzr/wool-website/issues/23)

- **Symptômes :** la suite sur le vrai Stripe (`npm run test:e2e:stripe`, mode test) échoue de
  façon intermittente, sur 1 à 3 tests différents à chaque fois :
  - après le clic sur « Payer », le retour vers `/checkout/success` n'arrive jamais
    (`page.waitForURL` dépasse 60 s). Sur la capture, le formulaire Stripe est entièrement
    rempli, le bouton « Payer » est visible, mais le focus est resté dans le champ « Nom
    complet » : le clic n'a pas été pris en compte ;
  - le message « carte refusée » ou le défi 3D Secure n'apparaissent pas (même cause probable) ;
  - après un remboursement fait depuis Stripe, la pièce n'est pas encore remise en vente quand
    le test vérifie (webhook `charge.refunded` plus lent que l'attente du test).
- **Preuve que l'instabilité est antérieure :** mesures du 18/11/2026, chaque exécution sur un
  serveur démarré à froid :

  | Code testé | Résultats |
  |---|---|
  | Branche `chore/preparation-publication` | 7/7, 7/7, 4/7, 5/7 |
  | `main` (avant la branche) | 5/7 (un échec au retour de paiement, un sur le remboursement) |

  `test:e2e` (faux Stripe) reste stable : 39/39 sur 3 exécutions.
- **Pistes :**
  - `payOnStripe` (`tests/e2e-stripe/helpers.ts`) : attendre que le formulaire soit stable
    (suggestions d'adresse fermées, aucun champ en cours de validation) avant de cliquer sur
    « Payer » ; vérifier que le paiement démarre (bouton en traitement ou navigation) et
    recliquer une seule fois sinon ;
  - remboursement : allonger l'attente sur la base (`waitForDb`) du passage à « remboursée » et
    de la remise en vente, le webhook `charge.refunded` arrivant parfois plusieurs secondes après.
- **Critère d'acceptation :** 5 exécutions consécutives à 7/7.
- **Hors CI :** la suite demande la CLI Stripe et une clé de test ; elle se lance à la main.

## Isoler l'environnement Preview de Vercel

Issue : [#24](https://github.com/ThomasFzr/wool-website/issues/24)

Constaté le 19/11/2026 en testant la preview de la PR #13. La preview a déjà sa propre base
MongoDB et une clé Stripe de test ; `NEXTAUTH_URL` a été retirée de la portée Preview (next-auth
prend alors l'hôte de la requête). Restent partagées avec la production :

- **`AUTH_SECRET`** : la même valeur en Preview et en Production, donc un jeton de session émis
  par une preview est cryptographiquement valide en production. Risque faible (previews protégées
  par Vercel Authentication, bases différentes), mais à isoler : définir une valeur dédiée à la
  Preview.
- **`NEXT_PUBLIC_APP_URL`** : pointe sur le domaine de production ; les liens des emails envoyés
  depuis une preview mènent à la production. Définir une valeur propre à la Preview (l'alias
  stable de la branche, ou la dériver de `VERCEL_BRANCH_URL` dans le code). Variable figée au
  build : redéployer après changement.
- **`RESEND_API_KEY`, `EMAIL_FROM`, `SELLER_EMAIL`** : partagées entre tous les environnements.
  Les emails déclenchés depuis une preview **partent vraiment** : à l'acheteur, et à la vendeuse
  pour chaque commande de test. Pistes : `SELLER_EMAIL` propre à la Preview (adresse de test),
  ou capture des emails en Preview comme en local (`lib/emailOutbox.ts`), sans jamais l'activer
  en production.
- **Connexion Google** : non testable sur une preview tant que son URL n'est pas déclarée dans
  les URI de redirection du client OAuth Google. À vérifier en production après fusion, ou
  déclarer l'alias stable d'une branche de recette.

## [PREVIEW] dans le sujet des emails hors production

Issue : [#25](https://github.com/ThomasFzr/wool-website/issues/25)

- **Pourquoi :** les emails envoyés depuis une preview Vercel partent vraiment (voir « Isoler
  l'environnement Preview de Vercel ») et sont indiscernables de ceux de la production, pour
  l'acheteur comme pour la vendeuse.
- **Proposition :** dans `lib/sendEmail.ts`, préfixer le sujet par `[PREVIEW] ` quand
  `VERCEL_ENV` ne vaut pas `production` (preview, ou envoi réel en développement avec
  `EMAIL_TRANSPORT=resend`). En production, sujet inchangé.
- **Critères d'acceptation :** tests unitaires des trois cas (`production` : sujet inchangé ;
  `preview` : préfixe ; variable absente : préfixe), couverture à 100 % ; vérifié sur une preview
  avec un email de commande.

## Tests e2e sur build de production (piste)

Issue : [#26](https://github.com/ThomasFzr/wool-website/issues/26)

- **Pourquoi :** tester ce qui est réellement déployé (`next build` + `next start`, Turbopack),
  sans rechargement à chaud ni double exécution des effets du mode strict.
- **Obstacle :** deux garde-fous sont volontairement inactifs en production et servent aux tests :
  la redirection vers le faux Stripe (`lib/stripe.ts`, `STRIPE_API_BASE_URL`) et la capture des
  emails (`lib/emailOutbox.ts`). Il faudrait les activer par une variable dédiée aux tests, sans
  risque de l'activer en production (refus si `VERCEL_ENV=production`, par exemple).
- **Coût :** un build par suite (les variables `NEXT_PUBLIC_*` sont figées au build).
