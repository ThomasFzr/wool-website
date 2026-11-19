import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH } from "@/app/api/account/profile/route";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { makeRequest, readJson } from "../../../helpers/http";
import { asAnonymous, asUser } from "../../../helpers/session";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));

const patch = (body: unknown) => PATCH(makeRequest("/api/account/profile", { method: "PATCH", body }));
const get = () => GET(makeRequest("/api/account/profile"));

describe("/api/account/profile", () => {
  beforeEach(async () => {
    await connectToDatabase();
  });

  describe("GET", () => {
    it("refuse un visiteur non connecté", async () => {
      asAnonymous();
      expect((await get()).status).toBe(401);
    });

    it("répond 404 si l'utilisateur n'existe plus", async () => {
      asUser("fantome@example.com");
      expect((await get()).status).toBe(404);
    });

    it("renvoie le profil sans les champs sensibles", async () => {
      await User.create({
        email: "client@example.com",
        name: "Client",
        city: "Lyon",
        password: "hash",
        resetToken: "token-hash",
        resetTokenExpiry: new Date(),
      });
      await User.create({ email: "autre@example.com", name: "Autre" });
      asUser();
      const { status, body } = await readJson(await get());
      expect(status).toBe(200);
      expect(body).toMatchObject({ email: "client@example.com", name: "Client", city: "Lyon" });
      expect(body).not.toHaveProperty("password");
      expect(body).not.toHaveProperty("resetToken");
      expect(body).not.toHaveProperty("resetTokenExpiry");
    });

    it("répond 500 si la base échoue", async () => {
      asUser();
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(User, "findOne").mockImplementationOnce(() => {
        throw new Error("db down");
      });
      const { status, body } = await readJson(await get());
      expect(status).toBe(500);
      expect(body.error).toBe("Erreur serveur");
    });
  });

  describe("PATCH", () => {
    it("refuse un visiteur non connecté", async () => {
      asAnonymous();
      expect((await patch({ name: "X" })).status).toBe(401);
    });

    it.each([
      ["name", "x".repeat(101)],
      ["phone", "0".repeat(31)],
      ["address", "a".repeat(201)],
      ["city", "c".repeat(101)],
      ["postalCode", "1".repeat(11)],
      ["phone", 612345678],
      ["name", null],
    ])("refuse le champ %s invalide (%s)", async (key, value) => {
      asUser();
      const { status, body } = await readJson(await patch({ [key]: value }));
      expect(status).toBe(400);
      expect(body.error).toMatch(/longueur maximale|invalide/);
      expect(body.champ).toBe(key);
    });

    it("répond 404 si l'utilisateur n'existe plus", async () => {
      asUser("fantome@example.com");
      expect((await patch({ name: "X" })).status).toBe(404);
    });

    it("met à jour les champs fournis et ignore les autres", async () => {
      await User.create({ email: "client@example.com", name: "Ancien", city: "Lyon" });
      asUser();
      const update = {
        name: "Nouveau",
        phone: "0612345678",
        address: "1 rue de la Laine",
        postalCode: "69001",
        role: "admin",
        email: "pirate@example.com",
      };
      const { status, body } = await readJson(await patch(update));
      expect(status).toBe(200);
      expect(body).toEqual({
        message: "Profil mis à jour",
        user: {
          name: "Nouveau",
          email: "client@example.com",
          phone: "0612345678",
          address: "1 rue de la Laine",
          city: "Lyon",
          postalCode: "69001",
        },
      });
      const user = await User.findOne({ email: "client@example.com" });
      expect(user).toMatchObject({ role: "user", city: "Lyon", name: "Nouveau" });
      expect(await User.countDocuments({ email: "pirate@example.com" })).toBe(0);
    });

    it("accepte une chaîne vide pour effacer un champ", async () => {
      await User.create({ email: "client@example.com", phone: "0612345678" });
      asUser();
      const { body } = await readJson(await patch({ phone: "" }));
      expect(body.user.phone).toBe("");
    });

    it("répond 400 sur un corps qui n'est pas du JSON", async () => {
      asUser();
        expect((await patch("{pas du json")).status).toBe(400);
    });
  });
});
