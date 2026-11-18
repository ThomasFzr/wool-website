# Sécurité — couverture de l'OWASP Top 10

Ce document décrit, catégorie par catégorie de l'[OWASP Top 10 (2021)](https://owasp.org/Top10/),
les mesures en place dans MailleMum, avec les liens vers le code qui les applique et les tests qui
les prouvent. Il se termine par les limites connues et les améliorations prévues.

Démarche : une revue complète du code a été faite en novembre 2026, puis corrigée en quatre
sessions, chacune avec ses tests de non-régression
([`docs/revue-2026-11.md`](revue-2026-11.md), PR #5 à #9). La logique serveur est couverte à
100 % par les tests unitaires (seuil imposé dans [`vitest.config.ts`](../vitest.config.ts)).

## Synthèse

| Catégorie | État |
|---|---|
| A01 — Contrôle d'accès défaillant | ✅ Couvert |
| A02 — Défaillances cryptographiques | ✅ Couvert |
| A03 — Injection (dont XSS) | ✅ Couvert — validation centralisée prévue |
| A04 — Conception non sécurisée | ✅ Couvert |
| A05 — Mauvaise configuration de sécurité | ✅ Couvert |
| A06 — Composants vulnérables et obsolètes | ✅ Couvert — dépendances à jour, Dependabot, audit en CI |
| A07 — Identification et authentification | ✅ Couvert — durcissements prévus |
| A08 — Intégrité des logiciels et des données | ✅ Couvert |
| A09 — Journalisation et surveillance | ⚠️ Partiel — journal d'audit prévu |
| A10 — Falsification de requête côté serveur (SSRF) | ✅ Couvert |

---

## A01 — Contrôle d'accès défaillant

| Mesure | Code | Tests |
|---|---|---|
| Chaque route d'API admin vérifie la session **et** le rôle `admin` côté serveur, avant toute lecture | [`lib/auth.ts`](../lib/auth.ts#L8-L20), appelé dans toutes les routes de [`app/api/admin/`](../app/api/admin) et dans les écritures de [`app/api/creations/`](../app/api/creations) | « est réservé aux admins » dans chaque fichier de [`tests/unit/api/admin/`](../tests/unit/api/admin), [`lib/auth.test.ts`](../tests/unit/lib/auth.test.ts) |
| Les pages `/admin/**` sont gardées côté serveur (redirection sans rendu) | [`app/admin/layout.tsx`](../app/admin/layout.tsx#L15-L18) | [`tests/e2e/admin.spec.ts`](../tests/e2e/admin.spec.ts#L9) « un client n'a pas accès à l'admin » |
| Rôle revérifié en base toutes les 5 min : un admin révoqué ou un compte supprimé perd ses droits sans reconnexion | [`authOptions.ts`](../app/api/auth/%5B...nextauth%5D/authOptions.ts#L160-L183) | [`authOptions.test.ts`](../tests/unit/api/auth/authOptions.test.ts#L258) (révocation admin), [L276](../tests/unit/api/auth/authOptions.test.ts#L276) (compte supprimé) |
| Aucun compte admin par défaut : la promotion se fait à la main en base | [`README.md`](../README.md#installation) | — |
| Accès aux données d'un autre client refusé (IDOR) : la session Stripe doit appartenir à l'utilisateur connecté | [`verify-session/route.ts`](../app/api/stripe/verify-session/route.ts#L49-L50) | [`verify-session.test.ts`](../tests/unit/api/stripe/verify-session.test.ts#L72) « refuse la session d'un autre client » |
| Créations masquées invisibles et non achetables pour les visiteurs | [`create-checkout-session/route.ts`](../app/api/stripe/create-checkout-session/route.ts) | [`create-checkout-session.test.ts`](../tests/unit/api/stripe/create-checkout-session.test.ts#L79), [`creations/route.test.ts`](../tests/unit/api/creations/route.test.ts#L22) |
| Outils de debug fermés en production | [`env-info`](../app/api/env-info/route.ts#L7-L12), [`version`](../app/api/version/route.ts), [`dev/emails`](../app/dev/emails/%5Bid%5D/raw/route.ts#L12-L14) | [`env-info.test.ts`](../tests/unit/api/env-info.test.ts#L19), [`version.test.ts`](../tests/unit/api/version.test.ts#L68), [`emailRaw.test.ts`](../tests/unit/dev/emailRaw.test.ts#L41) |
| Cron protégé par secret, refus si le secret n'est pas configuré | [`cron/release-locks/route.ts`](../app/api/cron/release-locks/route.ts#L11-L14) | [`release-locks.test.ts`](../tests/unit/api/cron/release-locks.test.ts#L17-L23) |
| Pas de redirection ouverte après connexion | [`lib/safe-redirect.ts`](../lib/safe-redirect.ts#L10) | [`safe-redirect.test.ts`](../tests/unit/lib/safe-redirect.test.ts), [`tests/e2e/auth.spec.ts`](../tests/e2e/auth.spec.ts#L38) |

## A02 — Défaillances cryptographiques

| Mesure | Code | Tests |
|---|---|---|
| Mots de passe hachés avec bcrypt, jamais renvoyés (`select: false` sur le modèle) | [`register/route.ts`](../app/api/register/route.ts#L52), [`models/User.ts`](../models/User.ts) | [`register.test.ts`](../tests/unit/api/register.test.ts) |
| Jeton de réinitialisation aléatoire (32 octets), stocké **haché** (SHA-256), valable 1 h, à usage unique | [`forgot-password/route.ts`](../app/api/auth/forgot-password/route.ts#L55-L60), [`reset-password/route.ts`](../app/api/auth/reset-password/route.ts#L28-L50) | [`forgot-password.test.ts`](../tests/unit/api/auth/forgot-password.test.ts#L52), [`reset-password.test.ts`](../tests/unit/api/auth/reset-password.test.ts#L43-L62) (jeton inconnu, hash présenté comme jeton, jeton expiré) |
| Sessions JWT signées (`AUTH_SECRET`), cookies `HttpOnly`, `Secure`, `SameSite=Lax` (next-auth) | [`authOptions.ts`](../app/api/auth/%5B...nextauth%5D/authOptions.ts#L25-L28) | [`authOptions.test.ts`](../tests/unit/api/auth/authOptions.test.ts#L33) |
| HTTPS imposé : HSTS 2 ans et `upgrade-insecure-requests` | [`next.config.js`](../next.config.js#L25) et [L79-L80](../next.config.js#L79-L80) | [`next-config.test.ts`](../tests/unit/next-config.test.ts) |
| Aucun secret dans le dépôt ni dans son historique (vérifié avec gitleaks) ; secrets dans les variables Vercel | [`.env.example`](../.env.example), [`.gitignore`](../.gitignore) | — |

## A03 — Injection (dont XSS)

| Mesure | Code | Tests |
|---|---|---|
| Recherche texte : saisie échappée avant tout `$regex` MongoDB (injection regex, ReDoS) | [`lib/escape.ts`](../lib/escape.ts#L15), utilisé dans [`admin/reservations/route.ts`](../app/api/admin/reservations/route.ts#L69) et [`account/reservations/route.ts`](../app/api/account/reservations/route.ts#L48) | [`escape.test.ts`](../tests/unit/lib/escape.test.ts#L22) |
| Types vérifiés sur les routes publiques (`typeof`, `isValidObjectId`) : pas d'objet `{"$ne": …}` injecté dans un filtre | [`register`](../app/api/register/route.ts#L30-L43), [`reset-password`](../app/api/auth/reset-password/route.ts#L12), [`availability`](../app/api/creations/availability/route.ts#L23) | [`reset-password.test.ts`](../tests/unit/api/auth/reset-password.test.ts#L89) |
| Mise à jour par liste blanche de champs + validateurs Mongoose (pas d'affectation de masse) | [`admin/reservations/[id]/route.ts`](../app/api/admin/reservations/%5Bid%5D/route.ts#L15) | [`reservation-id.test.ts`](../tests/unit/api/admin/reservations/reservation-id.test.ts) |
| XSS stocké : HTML des descriptions filtré par liste blanche (`sanitize-html`) à l'enregistrement **et** à l'affichage | [`lib/sanitize.ts`](../lib/sanitize.ts#L9-L20), [`creations/route.ts`](../app/api/creations/route.ts#L116), [`creations/[id]/page.tsx`](../app/creations/%5Bid%5D/page.tsx#L156), seul `dangerouslySetInnerHTML` : [`Accordion.tsx`](../components/ui/Accordion.tsx#L69) | [`sanitize.test.ts`](../tests/unit/lib/sanitize.test.ts#L10-L21) (`<script>`, `onerror`, `javascript:`, `<iframe>`, `style`…) |
| Données utilisateur échappées dans les emails HTML ; React échappe tout le reste | [`lib/escape.ts`](../lib/escape.ts#L3) | [`escape.test.ts`](../tests/unit/lib/escape.test.ts#L10) |
| Prix relus en base, jamais pris dans la requête du client | [`create-checkout-session/route.ts`](../app/api/stripe/create-checkout-session/route.ts#L104) et [L312](../app/api/stripe/create-checkout-session/route.ts#L312) | [`create-checkout-session.test.ts`](../tests/unit/api/stripe/create-checkout-session.test.ts) |

## A04 — Conception non sécurisée

| Mesure | Code | Tests |
|---|---|---|
| Pièces uniques : verrou atomique (`findOneAndUpdate` conditionnel) pendant le paiement, libéré seulement par la réservation qui le détient | [`create-checkout-session/route.ts`](../app/api/stripe/create-checkout-session/route.ts#L189), [`lib/creation-lock.ts`](../lib/creation-lock.ts#L21) | [`creation-lock.test.ts`](../tests/unit/lib/creation-lock.test.ts#L27) « ne touche pas au verrou d'une autre réservation » |
| Traitement du paiement idempotent (webhook et retour client concurrents), événements rejoués sans effet | [`lib/checkout-fulfillment.ts`](../lib/checkout-fulfillment.ts) | [`checkout-fulfillment.test.ts`](../tests/unit/lib/checkout-fulfillment.test.ts#L741) |
| Double vente : remboursement automatique et alerte de la vendeuse | [`lib/checkout-fulfillment.ts`](../lib/checkout-fulfillment.ts) | [`checkout-fulfillment.test.ts`](../tests/unit/lib/checkout-fulfillment.test.ts) |
| Pré-prise de contrôle de compte : un mot de passe posé sur une adresse jamais prouvée est supprimé à la première connexion Google, et les sessions ouvertes avec lui sont révoquées | [`authOptions.ts`](../app/api/auth/%5B...nextauth%5D/authOptions.ts#L98-L111) | [`authOptions.test.ts`](../tests/unit/api/auth/authOptions.test.ts#L153) |
| Formulaire de contact : honeypot, limite par IP, pas de relais de spam | [`contact/route.ts`](../app/api/contact/route.ts#L99-L107) | [`contact.test.ts`](../tests/unit/api/contact.test.ts#L126-L151) |

## A05 — Mauvaise configuration de sécurité

| Mesure | Code | Tests |
|---|---|---|
| En-têtes : Content-Security-Policy, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` ; `X-Powered-By` retiré | [`next.config.js`](../next.config.js#L11-L26) et [L55-L92](../next.config.js#L55-L92) | [`next-config.test.ts`](../tests/unit/next-config.test.ts#L18) |
| Pages privées exclues de l'indexation (`robots.txt` et `noindex` sur `/admin`, `/account`, `/cart`, `/checkout`) | [`app/robots.ts`](../app/robots.ts), layouts de ces dossiers, [`lib/site.ts`](../lib/site.ts) | [`seo.test.ts`](../tests/unit/app/seo.test.ts#L9) |
| Erreurs serveur génériques côté client (détails seulement dans les journaux) | routes de [`app/api/`](../app/api) | tests des routes (cas 500) |
| Previews Vercel protégées par Vercel Authentication | configuration Vercel | — |

## A06 — Composants vulnérables et obsolètes

| Mesure | Où |
|---|---|
| Dépendances de production à jour, `npm audit --omit=dev` sans vulnérabilité haute ni critique | [`package.json`](../package.json), [`package-lock.json`](../package-lock.json) |
| Audit des dépendances de production à chaque push et pull request | [`.github/workflows/tests.yml`](../.github/workflows/tests.yml) |
| Mises à jour proposées automatiquement chaque semaine, regroupées | [`.github/dependabot.yml`](../.github/dependabot.yml) |

## A07 — Identification et authentification

| Mesure | Code | Tests |
|---|---|---|
| Force brute : 10 échecs de connexion par IP et par 15 min, compteur partagé entre instances (MongoDB) | [`authOptions.ts`](../app/api/auth/%5B...nextauth%5D/authOptions.ts#L16-L19) et [L49-L54](../app/api/auth/%5B...nextauth%5D/authOptions.ts#L49-L54), [`lib/rate-limit.ts`](../lib/rate-limit.ts) | [`authOptions.test.ts`](../tests/unit/api/auth/authOptions.test.ts#L81), [`rate-limit.test.ts`](../tests/unit/lib/rate-limit.test.ts) |
| Limites sur l'inscription (5 par heure et par IP) et sur « mot de passe oublié » (par IP et par adresse) | [`register/route.ts`](../app/api/register/route.ts#L10-L22), [`forgot-password/route.ts`](../app/api/auth/forgot-password/route.ts#L41-L43) | [`register.test.ts`](../tests/unit/api/register.test.ts#L78), [`forgot-password.test.ts`](../tests/unit/api/auth/forgot-password.test.ts#L83-L105) |
| « Mot de passe oublié » ne révèle pas si un compte existe, même en cas d'erreur d'envoi | [`forgot-password/route.ts`](../app/api/auth/forgot-password/route.ts) | [`forgot-password.test.ts`](../tests/unit/api/auth/forgot-password.test.ts#L35-L123) |
| Sessions révoquées après un changement ou une réinitialisation de mot de passe | [`authOptions.ts`](../app/api/auth/%5B...nextauth%5D/authOptions.ts#L177-L179), [`reset-password/route.ts`](../app/api/auth/reset-password/route.ts#L51-L52) | [`authOptions.test.ts`](../tests/unit/api/auth/authOptions.test.ts#L288) |
| Connexion Google (OAuth) en alternative au mot de passe | [`authOptions.ts`](../app/api/auth/%5B...nextauth%5D/authOptions.ts#L30-L37) | [`authOptions.test.ts`](../tests/unit/api/auth/authOptions.test.ts#L121) |

## A08 — Intégrité des logiciels et des données

| Mesure | Code | Tests |
|---|---|---|
| Webhook Stripe : signature vérifiée sur le corps brut, refus sans en-tête ou avec une signature fausse | [`webhook/route.ts`](../app/api/stripe/webhook/route.ts#L31-L48) | [`webhook.test.ts`](../tests/unit/api/stripe/webhook.test.ts#L85-L104) |
| Contenu du webhook non pris pour argent comptant : la session est relue auprès de l'API Stripe ; 500 pour que Stripe réessaie si la commande n'est pas enregistrée | [`webhook/route.ts`](../app/api/stripe/webhook/route.ts#L59-L75) | [`webhook.test.ts`](../tests/unit/api/stripe/webhook.test.ts) |
| Envois d'images signés côté serveur (route admin) : aucun envoi possible sans signature | [`cloudinary-signature/route.ts`](../app/api/admin/cloudinary-signature/route.ts) | [`cloudinary-signature.test.ts`](../tests/unit/api/admin/cloudinary-signature/cloudinary-signature.test.ts#L15), [`useImageUpload.test.ts`](../tests/unit/hooks/useImageUpload.test.ts#L122) |
| Intégration continue : lint, typecheck, tests (100 % de couverture), e2e et audit à chaque push ; même contrôle en local par le hook `pre-push` | [`.github/workflows/tests.yml`](../.github/workflows/tests.yml), [`.githooks/pre-push`](../.githooks/pre-push) | — |
| Versions des dépendances figées (`package-lock.json`, `npm ci` en CI) | [`package-lock.json`](../package-lock.json) | — |

## A09 — Journalisation et surveillance

| Mesure | Code |
|---|---|
| Erreurs serveur journalisées (`console.error`, conservées par Vercel), sans données personnelles dans les journaux | routes de [`app/api/`](../app/api) ; `console.log` retirés en production : [`next.config.js`](../next.config.js#L47-L51) |
| Alertes email à la vendeuse sur les incidents de paiement (double vente, paiement sans réservation) | [`lib/checkout-fulfillment.ts`](../lib/checkout-fulfillment.ts) |

Limite : pas encore de journal d'audit des actions admin ni des échecs de connexion (voir plus bas).

## A10 — Falsification de requête côté serveur (SSRF)

| Mesure | Code | Tests |
|---|---|---|
| Aucune requête serveur vers une URL fournie par l'utilisateur | — | — |
| Optimisation d'images limitée à `res.cloudinary.com` | [`next.config.js`](../next.config.js#L30-L36) | [`next-config.test.ts`](../tests/unit/next-config.test.ts) |
| Liens des emails construits depuis `NEXT_PUBLIC_APP_URL` ou une liste d'hôtes autorisés, jamais depuis l'en-tête `Host` brut | [`lib/url.ts`](../lib/url.ts) | [`url.test.ts`](../tests/unit/lib/url.test.ts#L83), [`forgot-password.test.ts`](../tests/unit/api/auth/forgot-password.test.ts#L75) |

## CSRF

Pas de Server Actions ; les routes d'API attendent du JSON et les cookies de session sont
`SameSite=Lax`, donc non envoyés par un formulaire d'un autre site. next-auth protège ses propres
routes par jeton CSRF. Aucune route `GET` ne modifie de données (le cron exige un secret).

---

## Limites connues et améliorations prévues

Identifiées lors de l'audit de pré-publication, prévues dans une prochaine pull request :

- **A03** — Validation centralisée des entrées par schémas (zod) sur toutes les routes, et option
  `sanitizeFilter` de Mongoose activée globalement (aujourd'hui la validation est faite route par
  route ; quelques routes admin ne vérifient pas encore le type de chaque champ).
- **A07** — Mots de passe de 12 caractères minimum (6 aujourd'hui) ; limite de connexion par
  compte en plus de la limite par IP ; connexion Google obligatoire pour les administrateurs
  (double authentification déléguée à Google) ; coût bcrypt porté à 12.
- **A09** — Journal d'audit (qui, quoi, quand, IP) des actions admin et des échecs de connexion.
- **A05** — CSP avec `script-src 'unsafe-inline'` : compromis assumé, des nonces imposeraient un
  rendu dynamique de toutes les pages et supprimeraient le cache ISR.
- **A08** — Contraindre dossier et formats dans la signature des envois Cloudinary ; comparaison
  du secret du cron en temps constant.

## Signaler une vulnérabilité

Merci de ne pas ouvrir d'issue publique : utiliser le signalement privé de GitHub
(onglet **Security** → **Report a vulnerability**) sur ce dépôt.
