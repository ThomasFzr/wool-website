import "next-auth";
import "next-auth/jwt";
import type { PasswordWarning } from "@/lib/password-policy";

declare module "next-auth" {
  interface Session {
    provider?: string;
    /** Mot de passe de connexion trop court ou compromis : bandeau d'invitation à le changer. */
    passwordWarning?: PasswordWarning;
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      role: "user" | "admin";
    };
  }

  interface User {
    role?: "user" | "admin";
    passwordWarning?: PasswordWarning;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    provider?: string;
    role?: "user" | "admin";
    userId?: string;
    /** Dernière revérification du compte en base (ms). */
    roleCheckedAt?: number;
    /** Date de connexion (ms), comparée à User.passwordChangedAt. */
    authAt?: number;
    passwordWarning?: PasswordWarning;
  }
}