import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import clientPromise from "@/lib/mongodb";
import bcrypt from "bcryptjs";
import User, { IUserDocument } from "@/models/User";
import { connectToDatabase } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  adapter: MongoDBAdapter(clientPromise),
  session: {
    strategy: "jwt",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),

    Credentials({
      name: "Email & mot de passe",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;

        await connectToDatabase();
        const user = await User.findOne({ email: credentials.email })
          .lean<IUserDocument | null>();

        if (!user) return null;

        const ok = await bcrypt.compare(credentials.password, user.password!);
        if (!ok) return null;

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
    async signIn({ user, account, profile }) {
      // Mettre à jour ou créer l'utilisateur dans notre collection User
      if (account && user?.email) {
        await connectToDatabase();
        
        // Chercher l'utilisateur existant
        const existingUser = await User.findOne({ email: user.email });
        
        if (existingUser) {
          // Mettre à jour le provider s'il existe
          await User.findOneAndUpdate(
            { email: user.email },
            { 
              $set: { 
                provider: account.provider,
                name: user.name || existingUser.name
              } 
            }
          );
        } else if (account.provider !== "credentials") {
          // Créer un nouvel utilisateur pour les connexions SSO uniquement
          await User.create({
            email: user.email,
            name: user.name || null,
            provider: account.provider,
            role: "user",
          });
        }
      }
      return true;
    },
    async jwt({ token, account, user, trigger }) {
      // Lors de la connexion initiale
      if (user) {
        token.userId = user.id;
        token.role = user.role ?? "user";
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
          }
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