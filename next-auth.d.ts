import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    provider?: string;
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
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    provider?: string;
    role?: "user" | "admin";
    userId?: string;
  }
}