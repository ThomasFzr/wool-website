import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/prompts";
import Contact from "@/models/Contact";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import Settings from "@/models/Settings";
import User from "@/models/User";
import YarnBrand from "@/models/YarnBrand";

beforeEach(async () => {
  await connectToDatabase();
});

describe("réutilisation des modèles déjà compilés (hot-reload)", () => {
  it("renvoie le même modèle au rechargement des modules", async () => {
    vi.resetModules();
    const reloaded = await Promise.all([
      import("@/models/Contact"),
      import("@/models/Creation"),
      import("@/models/Reservation"),
      import("@/models/Settings"),
      import("@/models/User"),
      import("@/models/YarnBrand"),
    ]);
    expect(reloaded.map((m) => m.default)).toEqual([Contact, Creation, Reservation, Settings, User, YarnBrand]);
  });
});

describe("Contact", () => {
  it("exige nom, email, sujet et message", async () => {
    const err = await Contact.create({}).catch((e) => e);
    expect(Object.keys(err.errors).sort()).toEqual(["email", "message", "name", "subject"]);
  });

  it("crée un message « new » sans création ni utilisateur liés", async () => {
    const contact = await Contact.create({ name: "Léa", email: "lea@example.com", subject: "Question", message: "Bonjour" });
    expect(contact.status).toBe("new");
    expect(contact.creationId).toBeNull();
    expect(contact.userId).toBeNull();
    expect(contact.creationIds).toEqual([]);
    expect(contact.createdAt).toBeInstanceOf(Date);
  });

  it("refuse un statut inconnu", async () => {
    await expect(
      Contact.create({ name: "a", email: "a@a.fr", subject: "s", message: "m", status: "spam" as any })
    ).rejects.toThrow(/status/);
  });
});

describe("Creation", () => {
  const base = { title: "Bonnet", price: 30, color: "Rouge", type: "bonnet" };

  it("exige titre, prix, couleur et type", async () => {
    const err = await Creation.create({}).catch((e: any) => e);
    expect(Object.keys(err.errors).sort()).toEqual(["color", "price", "title", "type"]);
  });

  it("applique les valeurs par défaut d'une nouvelle création", async () => {
    const creation = await Creation.create(base);
    expect(creation.toObject()).toMatchObject({
      reserved: false,
      sold: false,
      showAsNew: true,
      salesCount: 0,
      hidden: false,
      displayOrder: 0,
      images: [],
      relatedCreations: [],
    });
  });

  it("refuse un prix, un poids ou un prix de fil négatif", async () => {
    for (const field of ["price", "weight", "yarnPrice"]) {
      await expect(Creation.create({ ...base, [field]: -1 })).rejects.toThrow(field);
    }
  });

  it("impose l'unicité du slug mais autorise plusieurs créations sans slug", async () => {
    await Creation.init();
    await Creation.create([{ ...base }, { ...base }]);
    await Creation.create({ ...base, slug: "bonnet" });
    await expect(Creation.create({ ...base, slug: "bonnet" })).rejects.toThrow(/duplicate key/);
  });
});

describe("Reservation", () => {
  it("applique les valeurs par défaut d'une commande", async () => {
    const r = await Reservation.create({ name: "Léa", contact: "lea@example.com" });
    expect(r.toObject()).toMatchObject({
      status: "pending",
      deliveryMode: "pickup",
      shippingCost: 0,
      seenByAdmin: false,
      paymentStatus: "pending",
    });
  });

  it.each([
    ["status", "lost"],
    ["cancelledBy", "robot"],
    ["deliveryMode", "drone"],
    ["paymentStatus", "maybe"],
  ])("refuse une valeur inconnue pour %s", async (field, value) => {
    await expect(Reservation.create({ [field]: value })).rejects.toThrow(field);
  });

  it("enregistre l'adresse de livraison", async () => {
    const shippingAddress = { name: "Léa", line1: "1 rue X", city: "Lyon", postalCode: "69001", country: "FR" };
    const r = await Reservation.create({ deliveryMode: "shipping", shippingAddress });
    expect((await Reservation.findById(r._id).lean() as any).shippingAddress).toMatchObject(shippingAddress);
  });
});

describe("Settings", () => {
  it("crée le document unique « main » avec les valeurs par défaut", async () => {
    const s = await Settings.create({});
    expect(s._id).toBe("main");
    expect(s.shippingCost).toBe(5);
    expect(s.types).toEqual(["bonnet", "tour de cou", "bandeau"]);
    expect(s.colors).toHaveLength(15);
    expect(s.systemPrompt).toBe(DEFAULT_SYSTEM_PROMPT);
    expect(s.pickupConditions.toObject()).toEqual({ enabled: false, minimumAmount: 0, allowedPostalCodes: [], message: "" });
  });
});

describe("User", () => {
  it("normalise l'email et applique les valeurs par défaut", async () => {
    const u = await User.create({ email: "  Lea@Example.COM " });
    expect(u.email).toBe("lea@example.com");
    expect(u.provider).toBe("credentials");
    expect(u.role).toBe("user");
    expect(u.emailNotifications).toBe(true);
  });

  it("ne renvoie jamais mot de passe ni jeton de réinitialisation sans select explicite", async () => {
    await User.create({ email: "a@example.com", password: "hash", resetToken: "tok", resetTokenExpiry: new Date() });
    const plain = (await User.findOne({ email: "a@example.com" }).lean())!;
    expect(plain).not.toHaveProperty("password");
    expect(plain).not.toHaveProperty("resetToken");
    expect(plain).not.toHaveProperty("resetTokenExpiry");
    const full = (await User.findOne({ email: "a@example.com" }).select("+password +resetToken").lean())!;
    expect(full.password).toBe("hash");
    expect(full.resetToken).toBe("tok");
  });

  it("refuse un rôle inconnu et un email en double", async () => {
    await expect(User.create({ email: "x@example.com", role: "root" as any })).rejects.toThrow(/role/);
    await User.init();
    await User.create({ email: "dup@example.com" });
    await expect(User.create({ email: "DUP@example.com" })).rejects.toThrow(/duplicate key/);
  });
});

describe("YarnBrand", () => {
  it("exige une marque unique et un prix aux 100 g", async () => {
    const err = await YarnBrand.create({}).catch((e: any) => e);
    expect(Object.keys(err.errors).sort()).toEqual(["brand", "pricePerHundredGrams"]);
    await YarnBrand.init();
    await YarnBrand.create({ brand: "Phildar", pricePerHundredGrams: 8 });
    await expect(YarnBrand.create({ brand: "Phildar", pricePerHundredGrams: 9 })).rejects.toThrow(/duplicate key/);
  });
});

it("déclare les index utilisés par les routes", () => {
  const keys = (m: mongoose.Model<any>) => m.schema.indexes().map(([k]) => k);
  expect(keys(Contact)).toContainEqual({ status: 1, createdAt: -1 });
  expect(keys(Creation)).toContainEqual({ hidden: 1, displayOrder: -1, createdAt: -1 });
  expect(keys(Reservation)).toContainEqual({ stripeCheckoutSessionId: 1 });
});
