# Fiche d'anomalie — Connexion annoncée réussie sans session (refus CSRF)

| Champ | Valeur |
|---|---|
| Identifiant | ANO-2026-11-01 |
| Date de détection | 18/11/2026 |
| Détectée par | Tests de bout en bout (`npm run test:e2e`, `npm run test:e2e:stripe`) après la mise à jour de sécurité des dépendances |
| Composant | Authentification — formulaire de connexion (`app/login/LoginForm.tsx`), next-auth 4 |
| Gravité | Moyenne : faux message de succès, pas de fuite de données ni d'accès indu |
| Priorité | Haute : bloque la fusion de la mise à jour de sécurité |
| Statut | Corrigée (correctif applicatif et tests) — anomalie liée ANO-2026-11-02 en cours (voir § 9) |
| Branche / commit | `chore/preparation-publication`, commit « fix(login): ne jamais annoncer une connexion sans session réelle » |

## 1. Contexte

Avant de rendre le dépôt public, les dépendances de production ont été mises à jour pour corriger
des vulnérabilités critiques (`next` 16.0.7 → 16.4.6, `mongoose`, `@auth/mongodb-adapter`,
`resend`). Les tests unitaires (992, 100 % de couverture), le lint et le typecheck sont restés
verts, mais les tests de bout en bout ont échoué à l'étape de connexion.

## 2. Symptômes

- `test:e2e` : le premier test après le démarrage du serveur échoue. Après la connexion, l'URL
  est bien `/account`, mais la page affiche le formulaire de connexion (aucune session).
- `test:e2e:stripe` : les 7 tests échouent à l'étape de connexion (voir aussi ANO-2026-11-02).
- Côté serveur, `POST /api/auth/callback/credentials` répond en 7 à 8 ms, trop vite pour une
  vérification bcrypt : le mot de passe n'est jamais vérifié.
- Réponse observée : `200 {"url":"http://localhost:3200/api/auth/signin?csrf=true"}`, sans cookie
  de session.
- Le formulaire redirige quand même vers la page demandée, comme si la connexion avait réussi.

## 3. Reproduction

Conditions : serveur de développement démarré à froid (routes pas encore compilées), formulaire
soumis **pendant** le chargement de la page.

1. `npx tsx tests/e2e-stripe/server/start.ts` (ou tout `next dev` venant de démarrer).
2. Ouvrir `/login?callbackUrl=%2F` dans un navigateur neuf.
3. Saisir des identifiants valides et valider immédiatement (en moins de 0,5 s).
4. Résultat : redirection vers `/`, utilisateur non connecté. Attendu : connexion, ou message
   d'erreur.

Reproduction déterministe, sans dépendre du timing : test e2e « jeton CSRF refusé » qui remplace
le champ `csrfToken` envoyé par le formulaire (`tests/e2e/auth.spec.ts`).

À la main (navigateur, `npm run dev`, compte admin du jeu de données de test, 2 s avant de
saisir), la connexion fonctionne : un humain soumet bien après la fin des chargements.

## 4. Environnement

| Élément | Version |
|---|---|
| Next.js | 16.4.6 (régression constatée) ; 16.0.7 (référence, sans anomalie) |
| React embarqué par Next | 19.3.0-canary-278794d7-20261002 (16.4.6) ; 19.3.0-canary-52684925-20251110 (16.0.7) |
| next-auth | 4.24.15 (stratégie JWT, provider Credentials) |
| Mode | `next dev` (Turbopack), `reactStrictMode: true` |
| Navigateur | Chromium (Playwright 1.65) |
| Système | macOS, Node.js 24 |

## 5. Analyse de la cause

### 5.1 Mécanisme

1. Au montage, `SessionProvider` (next-auth) charge la session : `GET /api/auth/session`.
2. En développement, le mode strict de React exécute les effets deux fois : **deux** requêtes
   partent en même temps, sans cookie.
3. next-auth 4 crée un nouveau cookie CSRF pour **chaque** requête reçue sans cookie : les deux
   réponses posent deux valeurs différentes (A, puis B).
4. À froid, la route `/api/auth/[...nextauth]` est compilée à la première requête : les deux
   réponses arrivent environ 450 ms plus tard, à 11 ms d'écart.
5. Si le formulaire est soumis entre-temps, `signIn()` demande son jeton (`GET /api/auth/csrf`)
   après la réponse A mais avant la réponse B. Le cookie B remplace A, puis le formulaire envoie
   le jeton A avec le cookie B : next-auth refuse (`?csrf=true`).
6. next-auth 4 signale ce refus par `ok: true` et `error: null`, seulement dans l'URL de retour.
   Le formulaire ne testait que `error` : il annonçait un succès.

Chronologie mesurée (branche, serveur froid, soumission immédiate) :

| t (ms) | Événement |
|---|---|
| 417 / 420 | 2 × `GET /api/auth/session` (sans cookie) |
| 445 | Clic sur « Se connecter » |
| 871 | Réponse session n° 1 → cookie CSRF A ; `GET /api/auth/csrf` → jeton A |
| 882 | Réponse session n° 2 → cookie CSRF **B** ; `POST /callback/credentials` (jeton A, cookie B) |
| 892 | Réponse `{"url":"…/api/auth/signin?csrf=true"}`, pas de cookie de session |

### 5.2 Comparaison pour isoler la cause

Même sonde Playwright (serveur froid, soumission immédiate), seul un paramètre varie :

| Configuration | Appels `session` au chargement | Résultat de la connexion |
|---|---|---|
| `main` — Next 16.0.7, mode strict activé | 1 | ✅ Session créée |
| Branche — Next 16.4.6, mode strict activé | **2** | ❌ `?csrf=true`, pas de session |
| Branche — Next 16.4.6, mode strict **désactivé** | 1 | ✅ Session créée |
| Branche, Next remis en 16.0.7 (autres mises à jour gardées) | 1 | ✅ Test e2e Stripe vert |

Conclusion : la mise à jour de Next.js embarque une version de React qui rejoue les effets au
premier rendu en mode strict. Ce comportement de développement révèle deux défauts préexistants :
next-auth 4 crée un cookie CSRF par requête sans cookie, et le formulaire ne lisait pas toute la
réponse de `signIn`.

### 5.3 Impact en production

Le mode strict ne double pas les effets en production : un seul appel `session`. La course reste
théoriquement possible si l'utilisateur soumet avant la toute première réponse `session` (fonction
qui démarre à froid), mais la fenêtre est très étroite. Avant le correctif, l'utilisateur aurait
alors été redirigé sans être connecté, sans message.

## 6. Correctif

Principe retenu : **corriger le défaut applicatif sans le masquer** (pas de nouvelle tentative
automatique), et rendre les tests fidèles au comportement d'un humain.

| Fichier | Changement |
|---|---|
| `lib/sign-in-result.ts` (nouveau) | `signInOutcome()` lit `ok`, `error` et l'URL de retour : échec si `csrf=` ou `error=` dans l'URL, si `ok` est faux ou si l'URL manque |
| `app/login/LoginForm.tsx` | Message d'erreur explicite selon la cause ; relecture de la session (`getSession()`) avant toute redirection |
| `tests/e2e/helpers.ts` | `waitForLoginPageReady()` : avant de saisir, attendre la fin du chargement de la page, appels `session` compris (`networkidle`) ; utilisé par toutes les connexions par formulaire |

Options écartées :
- Désactiver `reactStrictMode` : masque le problème en développement et supprime des contrôles utiles.
- Fournir la session initiale depuis le layout racine : rend toutes les pages dynamiques (perte
  du cache ISR du catalogue).
- Poser le cookie CSRF dans `proxy.ts` : supprimerait la course, mais reproduit le format interne
  de next-auth (couplage fragile).
- Correctif durable : migration vers Auth.js v5 (inscrite au backlog, `docs/BACKLOG.md`).

## 7. Tests ajoutés

| Test | Ce qu'il prouve |
|---|---|
| `tests/unit/lib/sign-in-result.test.ts` (10 cas) | Succès réel ; refus CSRF avec `error: null` et `ok: true` ; `error=` dans l'URL ; identifiants refusés ; absence de réponse, réponse non `ok`, URL absente ou illisible → jamais de succès |
| `tests/e2e/auth.spec.ts` — « jeton CSRF refusé : message d'erreur, aucune session, jamais de faux succès » | Avec un jeton falsifié : message affiché, URL `/login`, aucun cookie `next-auth.session-token` ; puis, avec le vrai jeton, la connexion aboutit |

Résultats après correctif : tests unitaires 992/992 (100 % de couverture) ; `test:e2e` 39/39
(exécution du 18/11/2026). Voir § 9 pour la stabilité des suites e2e.

## 8. Vérification

- Reproduction déterministe (jeton falsifié) : le message d'erreur s'affiche, aucune session.
- Connexion normale (unitaire, e2e, à la main) : inchangée.
- Message des identifiants incorrects inchangé (« Connexion impossible. »), testé.

## 9. Anomalie liée — ANO-2026-11-02 : boucle de rechargements en développement

Pendant l'analyse, une seconde anomalie, indépendante de la connexion, a été isolée :

- **Symptôme :** au démarrage à froid du serveur de dev, la page se recharge sans fin (130
  connexions WebSocket de rechargement à chaud en 8 s), sans aucune action de l'utilisateur.
- **Mécanisme :** Turbopack recompile un fichier JavaScript commun pendant le premier chargement,
  envoie `reloadPage: "HMR hash mismatch"` puis une mise à jour `restart`. Ce `restart` est
  renvoyé à chaque nouvelle connexion, donc la page se recharge indéfiniment.
- **Fréquence (5 démarrages à froid chacun) :**

  | Configuration | Boucles |
  |---|---|
  | `main` — Next 16.0.7, Turbopack | 0 / 5 |
  | Branche — Next 16.4.6, Turbopack | **2 / 5** |
  | Branche — Next 16.4.6, webpack (`next dev --webpack`) | 0 / 6 |

- **Cause :** régression de Turbopack dans Next.js 16.4.6, sans correctif disponible à la date de
  la fiche (16.4.6 est la dernière version). Impact limité au développement et aux tests e2e ;
  la production n'utilise pas le rechargement à chaud.
- **Statut :** analysée ; choix du contournement en attente (voir le compte rendu de la session).

## 10. Leçons retenues

- Tester un appel d'authentification sur toute sa réponse, pas sur un seul champ.
- Une mise à jour de sécurité doit passer par les tests de bout en bout avant fusion : les tests
  unitaires seuls n'auraient pas détecté ces anomalies.
- Isoler une régression par comparaison contrôlée (une seule variable à la fois) plutôt que par
  hypothèse.
