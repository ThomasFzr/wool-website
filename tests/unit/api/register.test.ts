import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/register/route";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { makeRequest, readJson } from "../../helpers/http";

const post = (body: unknown, headers?: Record<string, string>) =>
  POST(makeRequest("/api/register", { method: "POST", body, headers }));
const valid = { name: "Client", email: "client@example.com", password: "secret123" };

describe("POST /api/register", () => {
  beforeEach(async () => {
    await connectToDatabase();
  });

  it("exige email et mot de passe", async () => {
    for (const body of [{ password: "secret123" }, { email: "a@b.fr" }]) {
      const { status, body: res } = await readJson(await post(body));
      expect(status).toBe(400);
      expect(res.error).toBe("Email et mot de passe requis");
    }
  });

  it("refuse un email invalide ou qui n'est pas une chaîne", async () => {
    for (const email of ["pas-un-email", "a @b.fr", 42]) {
      const { status, body } = await readJson(await post({ ...valid, email }));
      expect(status).toBe(400);
      expect(body.error).toBe("Email invalide");
    }
  });

  it("refuse un mot de passe trop court ou qui n'est pas une chaîne", async () => {
    for (const password of ["12345", 12345678]) {
      const { status, body } = await readJson(await post({ ...valid, password }));
      expect(status).toBe(400);
      expect(body.error).toMatch(/6 caractères/);
    }
  });

  it("refuse un nom trop long ou qui n'est pas une chaîne", async () => {
    for (const name of ["x".repeat(101), 42]) {
      const { status, body } = await readJson(await post({ ...valid, name }));
      expect(status).toBe(400);
      expect(body.error).toBe("Nom invalide");
    }
  });

  it("crée le compte avec un email normalisé et un mot de passe haché", async () => {
    const { status, body } = await readJson(await post({ ...valid, email: "  Client@Example.COM " }));
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });

    const user = await User.findOne({ email: "client@example.com" }).select("+password");
    expect(user).toMatchObject({ name: "Client", provider: "credentials", role: "user" });
    expect(user!.password).not.toBe("secret123");
    expect(await bcrypt.compare("secret123", user!.password!)).toBe(true);
  });

  it("accepte une inscription sans nom", async () => {
    expect((await post({ email: valid.email, password: valid.password })).status).toBe(200);
    expect((await User.findOne({ email: valid.email }))!.name).toBeUndefined();
  });

  it("ignore un rôle envoyé par le client", async () => {
    await post({ ...valid, role: "admin" });
    expect((await User.findOne({ email: valid.email }))!.role).toBe("user");
  });

  it("refuse un email déjà utilisé, quelle que soit la casse", async () => {
    await User.create({ email: "client@example.com", provider: "google" });
    const { status, body } = await readJson(await post({ ...valid, email: "CLIENT@example.com" }));
    expect(status).toBe(409);
    expect(body.error).toBe("User exists");
    expect(await User.countDocuments()).toBe(1);
  });

  it("limite les inscriptions par IP et par heure, tentatives refusées comprises", async () => {
    vi.spyOn(Date, "now").mockReturnValue(500_000 * 3_600_000 + 1_000);
    const ip = { "x-real-ip": "203.0.113.7" };
    for (let i = 1; i <= 5; i++) {
      expect((await post({ ...valid, email: `client${i}@example.com` }, ip)).status).toBe(200);
    }

    const { status, body } = await readJson(await post({ ...valid, email: "client6@example.com" }, ip));
    expect(status).toBe(429);
    expect(body.error).toMatch(/Trop d'inscriptions/);
    expect(await User.countDocuments()).toBe(5);

    expect((await post({ ...valid, email: "client6@example.com" }, { "x-real-ip": "198.51.100.1" })).status).toBe(200);
  });

  it("répond 500 sur un corps JSON invalide", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, body } = await readJson(await post("{pas du json"));
    expect(status).toBe(500);
    expect(body.error).toBe("Server error");
  });
});
