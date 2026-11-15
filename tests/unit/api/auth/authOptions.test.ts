import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import type { Account, Session, User as AuthUser } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { resetAccountCheckCache } from "@/lib/account-check";

// Les callbacks et authorize sont appelés directement : on teste notre logique, pas next-auth.
const callbacks = authOptions.callbacks!;
const credentials = authOptions.providers.find((p) => p.id === "credentials") as any;
const authorize = (creds?: Record<string, string>, headers: Record<string, string> = {}) =>
  credentials.options.authorize(creds, { headers } as any) as Promise<any>;

const signIn = (user: Partial<AuthUser>, account: Partial<Account> | null) =>
  callbacks.signIn!({ user: user as AuthUser, account: account as Account | null } as any);

const jwt = (args: { token: Partial<JWT>; user?: Partial<AuthUser>; account?: Partial<Account> | null; trigger?: string }) =>
  callbacks.jwt!({ account: null, ...args } as any) as Promise<JWT & Record<string, any>>;

const google = { provider: "google", type: "oauth", providerAccountId: "g-1" } as Partial<Account>;
const credAccount = { provider: "credentials", type: "credentials", providerAccountId: "c-1" } as Partial<Account>;

const errorSpy = () => vi.spyOn(console, "error").mockImplementation(() => {});

describe("authOptions", () => {
  beforeEach(async () => {
    await connectToDatabase();
    resetAccountCheckCache();
  });

  it("déclare Google et Credentials, une session JWT et la page de login", () => {
    expect(authOptions.providers.map((p) => p.id)).toEqual(["google", "credentials"]);
    expect(authOptions.session?.strategy).toBe("jwt");
    expect(authOptions.pages?.signIn).toBe("/login");
  });

  it("branche l'adaptateur sur le client MongoDB partagé, obtenu à chaque appel", async () => {
    await User.create({ email: "adapter@example.com", provider: "google" });
    const found = await authOptions.adapter!.getUserByEmail!("adapter@example.com");
    expect(found).toMatchObject({ email: "adapter@example.com" });
  });

  describe("authorize (email + mot de passe)", () => {
    beforeEach(async () => {
      await User.create({
        email: "client@example.com",
        name: "Client",
        password: await bcrypt.hash("secret123", 4),
        provider: "credentials",
      });
    });

    it("refuse sans email ou sans mot de passe", async () => {
      expect(await authorize(undefined)).toBeNull();
      expect(await authorize({ email: "", password: "secret123" })).toBeNull();
      expect(await authorize({ email: "client@example.com", password: "" })).toBeNull();
    });

    it("refuse un email inconnu", async () => {
      expect(await authorize({ email: "inconnu@example.com", password: "secret123" })).toBeNull();
    });

    it("refuse un compte Google sans mot de passe local", async () => {
      await User.create({ email: "google@example.com", provider: "google" });
      expect(await authorize({ email: "google@example.com", password: "secret123" })).toBeNull();
    });

    it("refuse un mauvais mot de passe", async () => {
      expect(await authorize({ email: "client@example.com", password: "mauvais" })).toBeNull();
    });

    it("accepte le bon mot de passe en normalisant l'email", async () => {
      const user = await authorize({ email: "  CLIENT@Example.com ", password: "secret123" });
      const dbUser = await User.findOne({ email: "client@example.com" });
      expect(user).toEqual({ id: dbUser!._id.toString(), email: "client@example.com", name: "Client", role: "user" });
      expect(user).not.toHaveProperty("password");
    });

    it("bloque une IP après 10 échecs en 15 minutes, même avec le bon mot de passe", async () => {
      vi.spyOn(Date, "now").mockReturnValue(2_000_000 * 900_000 + 1_000);
      const ip = { "x-real-ip": "203.0.113.7" };
      await User.create({ email: "google@example.com", provider: "google" });
      // Tous les types d'échec comptent : compte inconnu, compte sans mot de passe, mauvais mot de passe
      expect(await authorize({ email: "inconnu@example.com", password: "x" }, ip)).toBeNull();
      expect(await authorize({ email: "google@example.com", password: "x" }, ip)).toBeNull();
      for (let i = 0; i < 7; i++) {
        expect(await authorize({ email: "client@example.com", password: "mauvais" }, ip)).toBeNull();
      }
      // Une connexion réussie ne compte pas comme un échec
      expect(await authorize({ email: "client@example.com", password: "secret123" }, ip)).not.toBeNull();
      expect(await authorize({ email: "client@example.com", password: "mauvais" }, ip)).toBeNull();

      expect(await authorize({ email: "client@example.com", password: "secret123" }, ip)).toBeNull();
      // Une autre IP n'est pas concernée
      expect(
        await authorize({ email: "client@example.com", password: "secret123" }, { "x-real-ip": "198.51.100.1" })
      ).not.toBeNull();
    });

    it("renvoie name undefined quand le compte n'a pas de nom", async () => {
      await User.create({
        email: "anonyme@example.com",
        password: await bcrypt.hash("secret123", 4),
        role: "admin",
      });
      const user = await authorize({ email: "anonyme@example.com", password: "secret123" });
      expect(user.name).toBeUndefined();
      expect(user.role).toBe("admin");
    });
  });

  describe("callback signIn", () => {
    it("autorise toujours, sans rien écrire sans compte ou sans email", async () => {
      expect(await signIn({ email: "x@example.com" }, null)).toBe(true);
      expect(await signIn({}, google)).toBe(true);
      expect(await User.countDocuments()).toBe(0);
    });

    it("crée l'utilisateur à la première connexion Google", async () => {
      expect(await signIn({ email: "nouveau@example.com", name: "Nouveau" }, google)).toBe(true);
      const dbUser = await User.findOne({ email: "nouveau@example.com" });
      expect(dbUser).toMatchObject({ name: "Nouveau", provider: "google", role: "user" });
      expect(dbUser!.emailVerifiedAt).toBeInstanceOf(Date);
    });

    it("crée l'utilisateur Google avec un nom null quand Google n'en fournit pas", async () => {
      await signIn({ email: "sansnom@example.com" }, google);
      expect((await User.findOne({ email: "sansnom@example.com" }))!.name).toBeNull();
    });

    it("ne crée pas d'utilisateur pour une connexion credentials inconnue", async () => {
      expect(await signIn({ email: "inconnu@example.com" }, credAccount)).toBe(true);
      expect(await User.countDocuments()).toBe(0);
    });

    it("garde le mot de passe et le provider credentials d'un compte à l'email prouvé qui se connecte avec Google", async () => {
      const verifiedAt = new Date("2026-01-01");
      await User.create({
        email: "client@example.com",
        name: "Ancien",
        provider: "credentials",
        password: "hash",
        emailVerifiedAt: verifiedAt,
      });
      await signIn({ email: "client@example.com", name: "Nom Google" }, google);
      const dbUser = await User.findOne({ email: "client@example.com" }).select("+password");
      expect(dbUser).toMatchObject({ name: "Nom Google", provider: "credentials", password: "hash" });
      expect(dbUser!.emailVerifiedAt).toEqual(verifiedAt);
    });

    it("retire le mot de passe d'un compte à l'email jamais prouvé à la première connexion Google (pré-prise de contrôle)", async () => {
      // Quelqu'un s'est inscrit avec l'adresse de la victime : la connexion Google de la
      // victime ne doit pas lui laisser un accès par mot de passe au même compte.
      await User.create({
        email: "victime@example.com",
        provider: "credentials",
        password: "hash-attaquant",
        resetToken: "t",
        resetTokenExpiry: new Date(Date.now() + 60_000),
      });
      await signIn({ email: "victime@example.com", name: "Victime" }, google);
      const dbUser = await User.findOne({ email: "victime@example.com" }).select(
        "+password +resetToken +resetTokenExpiry"
      );
      expect(dbUser).toMatchObject({ name: "Victime", provider: "google" });
      expect(dbUser!.password).toBeUndefined();
      expect(dbUser!.resetToken).toBeUndefined();
      expect(dbUser!.resetTokenExpiry).toBeUndefined();
      expect(dbUser!.emailVerifiedAt).toBeInstanceOf(Date);
      // La session déjà ouverte par l'attaquant avec ce mot de passe est révoquée
      expect(dbUser!.passwordChangedAt).toBeInstanceOf(Date);
      await expect(
        jwt({ token: { email: "victime@example.com", authAt: Date.now() - 60_000 } })
      ).rejects.toThrow("mot de passe changé");
      expect(await authorize({ email: "victime@example.com", password: "secret123" })).toBeNull();
    });

    it("ne prouve pas l'email lors d'une connexion credentials", async () => {
      await User.create({ email: "local@example.com", provider: "credentials", password: "hash" });
      await signIn({ email: "local@example.com" }, credAccount);
      const dbUser = await User.findOne({ email: "local@example.com" }).select("+password");
      expect(dbUser!.password).toBe("hash");
      expect(dbUser!.emailVerifiedAt).toBeUndefined();
    });

    it("met à jour le provider d'un compte non credentials et conserve l'ancien nom", async () => {
      await User.create({ email: "sso@example.com", name: "Ancien", provider: "github" });
      await signIn({ email: "sso@example.com" }, google);
      expect(await User.findOne({ email: "sso@example.com" })).toMatchObject({ name: "Ancien", provider: "google" });
    });

    it("met un nom vide quand ni la connexion ni le compte n'en ont", async () => {
      await User.create({ email: "vide@example.com", provider: "credentials" });
      await signIn({ email: "vide@example.com" }, credAccount);
      expect((await User.findOne({ email: "vide@example.com" }))!.name).toBe("");
    });

    it("autorise malgré une erreur de base, en la journalisant", async () => {
      const spy = errorSpy();
      vi.spyOn(User, "findOne").mockImplementationOnce(() => {
        throw new Error("db down");
      });
      expect(await signIn({ email: "x@example.com" }, google)).toBe(true);
      expect(spy).toHaveBeenCalledWith("[SignIn] Error:", expect.any(Error));
    });
  });

  describe("callback jwt", () => {
    it("copie id et rôle de l'utilisateur à la connexion credentials", async () => {
      const token = await jwt({
        token: { email: "client@example.com" },
        user: { id: "u1", email: "client@example.com", role: "admin" } as any,
        account: credAccount,
      });
      expect(token).toMatchObject({ userId: "u1", role: "admin", provider: "credentials" });
      expect(typeof token.roleCheckedAt).toBe("number");
    });

    it("donne le rôle user par défaut", async () => {
      const token = await jwt({ token: { email: "x@example.com" }, user: { id: "u1" } as any, account: credAccount });
      expect(token.role).toBe("user");
    });

    it("récupère rôle et id en base à la connexion Google", async () => {
      const dbUser = await User.create({ email: "admin@example.com", provider: "google", role: "admin" });
      const token = await jwt({
        token: { email: "admin@example.com" },
        user: { id: "id-adaptateur", email: "admin@example.com" } as any,
        account: google,
      });
      expect(token).toMatchObject({ role: "admin", userId: dbUser._id.toString(), provider: "google" });
    });

    it("garde les valeurs de l'adaptateur si l'utilisateur Google est absent de la base", async () => {
      const token = await jwt({
        token: { email: "absent@example.com" },
        user: { id: "id-adaptateur", email: "absent@example.com" } as any,
        account: google,
      });
      expect(token).toMatchObject({ role: "user", userId: "id-adaptateur" });
    });

    it("ne consulte pas la base pour un compte Google sans email", async () => {
      const spy = vi.spyOn(User, "findOne");
      const token = await jwt({ token: {}, user: { id: "u1" } as any, account: google });
      expect(spy).not.toHaveBeenCalled();
      expect(token.provider).toBe("google");
    });

    it("ne revérifie pas un rôle récent", async () => {
      await User.create({ email: "client@example.com", role: "admin" });
      const token = await jwt({ token: { email: "client@example.com", role: "user", roleCheckedAt: Date.now() } });
      expect(token.role).toBe("user");
    });

    it("revérifie le rôle en base quand il est périmé (révocation admin)", async () => {
      const dbUser = await User.create({ email: "ex-admin@example.com", role: "user" });
      const old = Date.now() - 6 * 60 * 1000;
      const token = await jwt({ token: { email: "ex-admin@example.com", role: "admin", roleCheckedAt: old } });
      expect(token.role).toBe("user");
      expect(token.userId).toBe(dbUser._id.toString());
      expect(token.roleCheckedAt).toBeGreaterThan(old);
    });

    it("revérifie le rôle sur trigger update même s'il est récent", async () => {
      await User.create({ email: "promu@example.com", role: "admin" });
      const token = await jwt({
        token: { email: "promu@example.com", role: "user", roleCheckedAt: Date.now() },
        trigger: "update",
      });
      expect(token.role).toBe("admin");
    });

    it("révoque la session d'un compte supprimé (y compris un ancien admin)", async () => {
      await expect(
        jwt({ token: { email: "supprime@example.com", role: "admin", userId: "u1" } })
      ).rejects.toThrow("compte supprimé");
    });

    it("note la date de connexion dans le token", async () => {
      const token = await jwt({ token: { email: "x@example.com" }, user: { id: "u1" } as any, account: credAccount });
      expect(token.authAt).toBeTypeOf("number");
      expect(token.authAt).toBeLessThanOrEqual(Date.now());
    });

    it("révoque une session ouverte avant un changement de mot de passe", async () => {
      await User.create({ email: "client@example.com", passwordChangedAt: new Date() });
      const authAt = Date.now() - 60_000;
      await expect(jwt({ token: { email: "client@example.com", authAt } })).rejects.toThrow("mot de passe changé");
    });

    it("révoque une session sans date de connexion (antérieure au correctif) après un changement", async () => {
      await User.create({ email: "client@example.com", passwordChangedAt: new Date(Date.now() - 86_400_000) });
      await expect(jwt({ token: { email: "client@example.com" } })).rejects.toThrow("mot de passe changé");
    });

    it("garde une session ouverte après le changement de mot de passe", async () => {
      const dbUser = await User.create({ email: "client@example.com", passwordChangedAt: new Date(Date.now() - 60_000) });
      const token = await jwt({ token: { email: "client@example.com", authAt: Date.now() } });
      expect(token.userId).toBe(dbUser._id.toString());
      expect(token.roleCheckedAt).toBeTypeOf("number");
    });

    it("ne relit pas la base à chaque rendu serveur d'un token périmé (cookie non réécrit)", async () => {
      await User.create({ email: "client@example.com", role: "user" });
      const spy = vi.spyOn(User, "findOne");
      const stale = { email: "client@example.com", role: "user" as const, roleCheckedAt: Date.now() - 6 * 60 * 1000 };
      const first = await jwt({ token: { ...stale } });
      const second = await jwt({ token: { ...stale } });
      expect(spy).toHaveBeenCalledTimes(1);
      // Date de la lecture réellement faite : le délai de prise en compte n'est pas prolongé
      expect(second.roleCheckedAt).toBe(first.roleCheckedAt);
    });

    it("relit la base sur trigger update malgré une vérification récente en cache", async () => {
      await User.create({ email: "promu@example.com", role: "user" });
      const stale = { email: "promu@example.com", role: "user" as const, roleCheckedAt: 0 };
      await jwt({ token: { ...stale } });
      await User.updateOne({ email: "promu@example.com" }, { role: "admin" });
      expect((await jwt({ token: { ...stale } })).role).toBe("user");
      expect((await jwt({ token: { ...stale }, trigger: "update" })).role).toBe("admin");
    });

    it("ne revérifie pas sans email dans le token", async () => {
      const spy = vi.spyOn(User, "findOne");
      const token = await jwt({ token: { role: "admin" } });
      expect(spy).not.toHaveBeenCalled();
      expect(token.role).toBe("admin");
    });

    it("garde le token si la revérification échoue", async () => {
      const spy = errorSpy();
      vi.spyOn(User, "findOne").mockImplementationOnce(() => {
        throw new Error("db down");
      });
      const token = await jwt({ token: { email: "x@example.com", role: "admin" } });
      expect(token.role).toBe("admin");
      expect(token.roleCheckedAt).toBeUndefined();
      expect(spy).toHaveBeenCalledWith("[JWT] Role refresh error:", expect.any(Error));
    });
  });

  describe("callback session", () => {
    const session = (token: Record<string, unknown>) =>
      callbacks.session!({
        session: { user: { email: "client@example.com" }, expires: "2999-01-01" } as Session,
        token: token as JWT,
      } as any) as Promise<Session>;

    it("expose provider, id et rôle du token", async () => {
      const s = await session({ provider: "google", userId: "u1", role: "admin" });
      expect(s.provider).toBe("google");
      expect(s.user).toMatchObject({ id: "u1", role: "admin", email: "client@example.com" });
    });

    it("met le rôle user par défaut et n'ajoute ni provider ni id", async () => {
      const s = await session({});
      expect(s.provider).toBeUndefined();
      expect(s.user.id).toBeUndefined();
      expect(s.user.role).toBe("user");
    });
  });
});
