import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { getClientPromise } from "@/lib/mongodb";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import User, { IUserDocument } from "@/models/User";
import { connectToDatabase } from "@/lib/db";
import { clientIp, hitRateLimit, rateLimitCount } from "@/lib/rate-limit";
import { ACCOUNT_CHECK_TTL, lookupAccount, type AccountState } from "@/lib/account-check";
import { passwordWarning } from "@/lib/password-policy";

// Le rôle stocké dans le JWT est revérifié en DB au plus toutes les ROLE_REFRESH_INTERVAL ms
// (sinon un admin révoqué garderait son rôle jusqu'à expiration du token).
const ROLE_REFRESH_INTERVAL = ACCOUNT_CHECK_TTL;

// Anti force brute : au-delà de LOGIN_MAX_FAILURES échecs depuis une même IP, ou de
// LOGIN_MAX_FAILURES_PER_ACCOUNT échecs sur un même email (attaque répartie sur plusieurs
// IP), toute tentative est refusée dans la fenêtre, même avec le bon mot de passe. Le refus
// est identique à un mauvais mot de passe : rien n'indique si le compte existe.
const LOGIN_MAX_FAILURES = 10;
const LOGIN_MAX_FAILURES_PER_ACCOUNT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

// Compteur par compte : clé dérivée de l'email (aucune adresse en clair dans les compteurs)
const accountRateKey = (email: string) =>
  `login:account:${crypto.createHash("sha256").update(email).digest("hex")}`;

export const authOptions: NextAuthOptions = {
  // Fonction et non promesse : après un échec de connexion, l'adaptateur retente au lieu de
  // garder la promesse rejetée.
  adapter: MongoDBAdapter(() => getClientPromise()),
  secret: process.env.AUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      // Liaison auto par email : acceptable car Google vérifie les adresses. Le mot de passe
      // d'un compte dont l'email n'a jamais été prouvé est supprimé à la liaison (callback signIn).
      // À reconsidérer si un provider aux emails non vérifiés est ajouté.
      allowDangerousEmailAccountLinking: true,
    }),

    Credentials({
      name: "Email & mot de passe",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials.password) return null;

        await connectToDatabase();
        const email = credentials.email.toLowerCase().trim();
        const ipKey = `login:ip:${clientIp(req?.headers)}`;
        const accountKey = accountRateKey(email);
        const [ipFailures, accountFailures] = await Promise.all([
          rateLimitCount(ipKey, LOGIN_WINDOW_MS),
          rateLimitCount(accountKey, LOGIN_WINDOW_MS),
        ]);
        if (ipFailures >= LOGIN_MAX_FAILURES || accountFailures >= LOGIN_MAX_FAILURES_PER_ACCOUNT) return null;
        const fail = async () => {
          await Promise.all([hitRateLimit(ipKey, LOGIN_WINDOW_MS), hitRateLimit(accountKey, LOGIN_WINDOW_MS)]);
          return null;
        };

        const user = await User.findOne({ email })
          .select("+password")
          .lean<IUserDocument | null>();

        if (!user) return fail();
        // Compte créé via Google : pas de mot de passe local
        if (!user.password) return fail();

        const ok = await bcrypt.compare(credentials.password, user.password);
        if (!ok) return fail();

        // Administrateurs : connexion Google uniquement (double authentification déléguée à
        // Google). Refus vérifié après bcrypt pour que le temps de réponse ne trahisse pas
        // un compte admin, et compté comme un échec, avec le même message neutre.
        if (user.role === "admin") return fail();

        // Ancien mot de passe trop court ou compromis : connexion acceptée, mais un bandeau
        // invite à le changer (aucune invalidation des mots de passe existants).
        const warning = await passwordWarning(credentials.password);

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name ?? undefined,
          role: user.role,
          ...(warning && { passwordWarning: warning }),
        };
      }
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account }) {
      // Mettre à jour ou créer l'utilisateur dans notre collection User
      if (account && user?.email) {
        try {
          await connectToDatabase();

          // Chercher l'utilisateur existant
          const existingUser = await User.findOne({ email: user.email });

          if (existingUser) {
            // Ne pas écraser "credentials" (sinon le changement de mot de passe
            // et forgot-password se retrouvent bloqués après un login Google)
            const updates: Record<string, unknown> = {
              name: user.name || existingUser.name || "",
            };
            const unset: Record<string, ""> = {};
            if (account.provider === "google") {
              updates.emailVerifiedAt = existingUser.emailVerifiedAt ?? new Date();
              // Compte créé par inscription sans que l'email ait jamais été prouvé : le mot de
              // passe a pu être posé par quelqu'un d'autre avant que la propriétaire de l'adresse
              // ne se connecte avec Google (pré-prise de contrôle). Seul Google fait foi : on le retire.
              if (!existingUser.emailVerifiedAt) {
                unset.password = "";
                unset.resetToken = "";
                unset.resetTokenExpiry = "";
                updates.provider = account.provider;
                // Révoque la session éventuellement ouverte avec ce mot de passe (callback jwt)
                updates.passwordChangedAt = new Date();
              }
            }
            if (existingUser.provider !== "credentials") {
              updates.provider = account.provider;
            }
            await User.findOneAndUpdate(
              { email: user.email },
              Object.keys(unset).length > 0 ? { $set: updates, $unset: unset } : { $set: updates }
            );
          } else if (account.provider !== "credentials") {
            // Créer un nouvel utilisateur pour les connexions SSO uniquement
            await User.create({
              email: user.email,
              name: user.name || null,
              provider: account.provider,
              role: "user",
              emailVerifiedAt: new Date(),
            });
          }
        } catch (error) {
          console.error("[SignIn] Error:", error);
        }
      }
      return true;
    },
    async jwt({ token, account, user, trigger }) {
      // Lors de la connexion initiale
      if (user) {
        token.userId = user.id;
        token.role = user.role ?? "user";
        token.roleCheckedAt = Date.now();
        // Date de connexion : une session ouverte avant un changement de mot de passe est révoquée
        token.authAt = Date.now();
        // Recalculé à chaque connexion : disparaît après reconnexion avec un nouveau mot de passe
        if (user.passwordWarning) token.passwordWarning = user.passwordWarning;
      }

      if (account) {
        token.provider = account.provider;

        // Si connexion via Google, récupérer le rôle depuis la DB
        if (account.provider === "google" && user?.email) {
          await connectToDatabase();
          const dbUser = await User.findOne({ email: user.email }).lean<IUserDocument | null>();
          if (dbUser) {
            token.role = dbUser.role;
            token.userId = dbUser._id.toString();
            token.roleCheckedAt = Date.now();
          }
        }
      }

      // Revérifier périodiquement le compte en DB (révocation admin, compte supprimé, mot de
      // passe changé) : effectif sans reconnexion, au plus ROLE_REFRESH_INTERVAL après.
      const stale = !token.roleCheckedAt || Date.now() - token.roleCheckedAt > ROLE_REFRESH_INTERVAL;
      // Lecture partagée entre les rendus de l'instance (cf. lib/account-check), sauf sur
      // trigger "update" (changement demandé par l'utilisateur) où elle est forcée.
      if ((trigger === "update" || stale) && token.email) {
        let checkedAt: number;
        let account: AccountState;
        try {
          ({ checkedAt, state: account } = await lookupAccount(token.email, { fresh: trigger === "update" }));
        } catch (error) {
          // Base indisponible : on garde le token plutôt que de déconnecter tout le monde
          console.error("[JWT] Role refresh error:", error);
          return token;
        }
        // Lever une erreur fait vider le cookie de session par next-auth (session révoquée).
        if (!account) throw new Error("Session révoquée : compte supprimé");
        if (account.passwordChangedAt && (token.authAt ?? 0) < account.passwordChangedAt) {
          throw new Error("Session révoquée : mot de passe changé");
        }
        // Compte devenu admin (promotion) avec une session ouverte autrement que par Google :
        // révoquée, l'accès admin exige une reconnexion avec Google.
        if (account.role === "admin" && token.provider !== "google") {
          throw new Error("Session révoquée : un administrateur se connecte avec Google");
        }
        token.role = account.role;
        token.userId = account.userId;
        token.roleCheckedAt = checkedAt;
      }

      return token;
    },
    async session({ session, token }) {
      if (token?.provider) {
        session.provider = token.provider;
      }
      if (token?.userId) {
        session.user.id = token.userId as string;
      }
      if (token?.passwordWarning) {
        session.passwordWarning = token.passwordWarning;
      }
      if (token?.role) {
        session.user.role = token.role as "user" | "admin";
      } else {
        session.user.role = "user";
      }

      return session;
    }
  },
};
