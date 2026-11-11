import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { getClientPromise } from "@/lib/mongodb";
import bcrypt from "bcryptjs";
import User, { IUserDocument } from "@/models/User";
import { connectToDatabase } from "@/lib/db";
import { clientIp, hitRateLimit, rateLimitCount } from "@/lib/rate-limit";

// Le rôle stocké dans le JWT est revérifié en DB au plus toutes les ROLE_REFRESH_INTERVAL ms
// (sinon un admin révoqué garderait son rôle jusqu'à expiration du token).
const ROLE_REFRESH_INTERVAL = 5 * 60 * 1000;

// Anti force brute : au-delà de LOGIN_MAX_FAILURES échecs depuis une même IP dans la fenêtre,
// toute tentative est refusée (même avec le bon mot de passe) jusqu'à la fenêtre suivante.
const LOGIN_MAX_FAILURES = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

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
        const rateKey = `login:ip:${clientIp(req?.headers)}`;
        if ((await rateLimitCount(rateKey, LOGIN_WINDOW_MS)) >= LOGIN_MAX_FAILURES) return null;
        const fail = async () => {
          await hitRateLimit(rateKey, LOGIN_WINDOW_MS);
          return null;
        };

        const user = await User.findOne({
          email: credentials.email.toLowerCase().trim(),
        })
          .select("+password")
          .lean<IUserDocument | null>();

        if (!user) return fail();
        // Compte créé via Google : pas de mot de passe local
        if (!user.password) return fail();

        const ok = await bcrypt.compare(credentials.password, user.password);
        if (!ok) return fail();

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name ?? undefined,
          role: user.role,
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
        (token as any).roleCheckedAt = Date.now();
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
            (token as any).roleCheckedAt = Date.now();
          }
        }
      }

      // Revérifier périodiquement le rôle en DB (révocation admin effective sans reconnexion)
      const roleCheckedAt = (token as any).roleCheckedAt as number | undefined;
      const stale = !roleCheckedAt || Date.now() - roleCheckedAt > ROLE_REFRESH_INTERVAL;
      if ((trigger === "update" || stale) && token.email) {
        try {
          await connectToDatabase();
          const dbUser = await User.findOne({ email: token.email }).lean<IUserDocument | null>();
          if (dbUser) {
            token.role = dbUser.role;
            token.userId = dbUser._id.toString();
          }
          (token as any).roleCheckedAt = Date.now();
        } catch (error) {
          console.error("[JWT] Role refresh error:", error);
        }
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
      if (token?.role) {
        session.user.role = token.role as "user" | "admin";
      } else {
        session.user.role = "user";
      }

      return session;
    }
  },
};
