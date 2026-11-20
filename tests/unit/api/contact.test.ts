import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { POST } from "@/app/api/contact/route";
import { connectToDatabase } from "@/lib/db";
import { sendEmail } from "@/lib/sendEmail";
import Contact from "@/models/Contact";
import Creation from "@/models/Creation";
import { makeRequest, readJson } from "../../helpers/http";
import { asAnonymous, asUser } from "../../helpers/session";
import { createCreation, insertRawCreation } from "../../helpers/creations-fixtures";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));
vi.mock("@/lib/sendEmail", () => ({ sendEmail: vi.fn() }));

const send = vi.mocked(sendEmail);
const post = (body: unknown, ip = "203.0.113.7") =>
  POST(makeRequest("/api/contact", { method: "POST", body, headers: { "x-real-ip": ip } }));

let n = 0;
const uniqueEmail = () => `visiteur${++n}@example.com`;
const message = (overrides: Record<string, unknown> = {}) => ({
  name: "Alice",
  email: uniqueEmail(),
  subject: "Question",
  message: "Bonjour, ce bonnet existe-t-il en bleu ?",
  ...overrides,
});

const sellerMail = () => send.mock.calls.find((c) => c[0].to === "vendeuse@example.com")?.[0];

beforeEach(async () => {
  await connectToDatabase();
  asAnonymous();
  send.mockResolvedValue({ data: { id: "1" }, error: null } as any);
  vi.stubEnv("SELLER_EMAIL", "vendeuse@example.com");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://boutique.example");
});

describe("POST /api/contact — validation", () => {
  it.each(["name", "email", "subject", "message"])("répond 400 si %s manque", async (field) => {
    const { status, body } = await readJson(await post(message({ [field]: "" })));
    expect(status).toBe(400);
    expect(body.error).toMatch(/requis/);
    expect(await Contact.countDocuments()).toBe(0);
  });

  it.each([
    ["name", "a".repeat(101)],
    ["email", `${"a".repeat(96)}@x.fr`],
    ["subject", "a".repeat(201)],
    ["message", "a".repeat(2001)],
  ])("répond 400 si %s est trop long", async (field, value) => {
    const { status, body } = await readJson(await post(message({ [field]: value })));
    expect(status).toBe(400);
    expect(body.error).toMatch(/longueur maximale/);
  });

  it.each([
    ["nom", "name", 42],
    ["email", "email", 123],
    ["sujet", "subject", ["Question"]],
    ["message", "message", { texte: "Bonjour" }],
    ["message blanc", "message", "   "],
  ])("répond 400 si le %s n'est pas une chaîne non vide", async (_label, field, value) => {
    const { status, body } = await readJson(await post(message({ [field]: value })));
    expect(status).toBe(400);
    expect(body.error).toMatch(/requis/);
  });

  it("répond 400 sur un corps qui n'est pas un objet", async () => {
    expect((await post("null")).status).toBe(400);
  });

  it.each(["pas-un-email", "a@b", "deux mots@example.com"])("répond 400 pour un email mal formé : %s", async (email) => {
    const { status, body } = await readJson(await post(message({ email })));
    expect(status).toBe(400);
    expect(body.error).toBe("Adresse email invalide.");
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ["creationId mal formé", { creationId: "pas-un-id" }],
    ["creationId non chaîne", { creationId: 42 }],
    ["creationIds non tableau", { creationIds: "65a000000000000000000001" }],
    ["creationIds avec un id mal formé", { creationIds: ["65a000000000000000000001", "x"] }],
    ["creationIds trop nombreux", { creationIds: Array.from({ length: 21 }, () => new mongoose.Types.ObjectId().toString()) }],
  ])("répond 400 pour des créations invalides (%s)", async (_label, extra) => {
    const { status, body } = await readJson(await post(message(extra)));
    expect(status).toBe(400);
    expect(body.error).toBe("Création invalide.");
    expect(await Contact.countDocuments()).toBe(0);
  });

  it.each([
    ["mot-clé", "Gagnez au casino"],
    ["domaine suspect", "Voir http://promo.ru/x"],
    ["lien HTML", '<a href="x">ici</a>'],
  ])("rejette un spam (%s)", async (_label, text) => {
    const { status, body } = await readJson(await post(message({ message: text })));
    expect(status).toBe(400);
    expect(body.error).toMatch(/spam/);
    expect(send).not.toHaveBeenCalled();
  });

  it.each(["Espèce de connard", "c0nn4rd", "What the fuck", "pùt4in", "m3rde alors"])(
    "rejette un contenu injurieux : %s",
    async (text) => {
      const { status, body } = await readJson(await post(message({ subject: text })));
      expect(status).toBe(400);
      expect(body.error).toMatch(/inapproprié/);
    }
  );

  it.each([
    "Avez-vous des fils de laine mérinos ?",
    "Ce bonnet est-il conçu pour un enfant ?",
    "Vous pouvez me rappeler au 0612345678",
    "Pouvez-vous me contacter ? Je suis à Concarneau.",
    "Je cherche un cadeau, mon budget est de 30 €",
  ])("accepte un message légitime : %s", async (text) => {
    expect((await post(message({ message: text }))).status).toBe(201);
  });
});

describe("POST /api/contact — rate limiting et robots", () => {
  it("bloque le 6e message d'une même IP en 10 minutes, quels que soient l'email ou le compte", async () => {
    vi.spyOn(Date, "now").mockReturnValue(3_000_000 * 600_000 + 1_000);
    for (let i = 0; i < 5; i++) {
      if (i === 2) asUser("client@example.com", { id: new mongoose.Types.ObjectId().toString() });
      expect((await post(message())).status).toBe(201);
    }
    const { status, body } = await readJson(await post(message()));
    expect(status).toBe(429);
    expect(body.error).toMatch(/Trop de messages/);
    expect(await Contact.countDocuments()).toBe(5);

    // Une autre IP n'est pas concernée
    expect((await post(message(), "198.51.100.1")).status).toBe(201);
  });

  it("réautorise l'envoi à la fenêtre suivante", async () => {
    const start = 3_000_000 * 600_000 + 1_000;
    const now = vi.spyOn(Date, "now").mockReturnValue(start);
    for (let i = 0; i < 5; i++) await post(message());
    expect((await post(message())).status).toBe(429);

    now.mockReturnValue(start + 600_000);
    expect((await post(message())).status).toBe(201);
  });

  it("fait comme si tout allait bien quand le honeypot est rempli, sans rien enregistrer ni envoyer", async () => {
    const { status, body } = await readJson(await post(message({ website: "https://spam.example" })));
    expect(status).toBe(201);
    expect(body).toEqual({ ok: true });
    expect(await Contact.countDocuments()).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("POST /api/contact — enregistrement et emails", () => {
  it("enregistre le message et prévient la vendeuse et l'expéditeur", async () => {
    const email = uniqueEmail();
    const { status, body } = await readJson(
      await post(message({ email, name: "<b>Alice</b>", subject: "Sujet & co" }))
    );

    expect(status).toBe(201);
    // Seul l'identifiant revient, pas le document enregistré
    const saved = await Contact.findOne({ email }).lean();
    expect(body).toEqual({ ok: true, id: saved!._id.toString() });
    expect(saved).toMatchObject({ status: "new", creationId: null, userId: null });

    expect(send).toHaveBeenCalledTimes(2);
    const seller = sellerMail()!;
    expect(seller.subject).toBe("📧 Nouveau message : Sujet & co");
    expect(seller.html).toContain("&lt;b&gt;Alice&lt;/b&gt;");
    expect(seller.html).not.toContain("<b>Alice</b>");
    expect(seller.html).toContain("https://boutique.example/admin/contact");
    expect(seller.html).not.toContain("concernée");

    // L'accusé de réception part vers une adresse non vérifiée : aucun texte de l'expéditeur
    const confirmation = send.mock.calls.find((c) => c[0].to === email)![0];
    expect(confirmation.subject).toBe("✅ Votre message a bien été reçu");
    expect(confirmation.html).not.toContain("Alice");
    expect(confirmation.html).not.toContain("Sujet");
  });

  it("met le sujet sur une seule ligne dans l'objet du mail vendeuse", async () => {
    await post(message({ subject: "Question\r\nBcc: victime@example.com\u2028suite" }));
    expect(sellerMail()!.subject).toBe("📧 Nouveau message : Question Bcc: victime@example.com suite");
  });

  it("rattache le message à l'utilisateur connecté", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    asUser("client@example.com", { id: userId });
    await post(message());
    expect((await Contact.findOne().lean())!.userId!.toString()).toBe(userId);
  });

  it("n'écrit qu'à l'expéditeur sans SELLER_EMAIL", async () => {
    vi.stubEnv("SELLER_EMAIL", "");
    const email = uniqueEmail();
    expect((await post(message({ email }))).status).toBe(201);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe(email);
  });

  it("décrit la création concernée (creationId) dans l'email vendeuse", async () => {
    const c = await createCreation({
      title: "Bonnet <rose>",
      imageUrl: 'https://img/bonnet.jpg"onerror="x',
      price: 25,
      color: "Rose <i>",
    });
    await post(message({ creationId: c._id.toString() }));

    const saved = (await Contact.findOne().lean())!;
    expect(saved.creationId!.toString()).toBe(c._id.toString());
    expect(saved.creationIds!.map(String)).toEqual([c._id.toString()]);
    const html = sellerMail()!.html;
    expect(html).toContain("Création concernée :");
    expect(html).toContain('src="https://img/bonnet.jpg&quot;onerror=&quot;x"');
    expect(html).toContain("Bonnet &lt;rose&gt;");
    expect(html).toContain("Prix : 25€");
    expect(html).toContain("Couleur : Rose &lt;i&gt;");
    expect(html).toContain("Disponible");
  });

  it("décrit plusieurs créations (creationIds) avec leur statut", async () => {
    const vendue = await createCreation({ sold: true, images: ["https://img/galerie.jpg"] });
    const reservee = await createCreation({ reserved: true, price: 0 });
    const sansCouleur = await insertRawCreation({ title: "Sans couleur", price: 3, type: "bonnet" });
    const ids = [vendue._id.toString(), reservee._id.toString(), sansCouleur.toString()];

    await post(message({ creationIds: [...ids, ids[1]], creationId: ids[0] }));

    // Doublons retirés
    expect((await Contact.findOne().lean())!.creationIds!.map(String)).toEqual(ids);
    const html = sellerMail()!.html;
    expect(html).toContain("Créations concernées :");
    expect(html).toContain('src="https://img/galerie.jpg"');
    expect(html).toContain("Vendu");
    expect(html).toContain("Réservé");
    expect(html).not.toContain("Prix : 0€");
    expect(html).toContain("Sans couleur");
  });

  it("ignore un tableau creationIds vide", async () => {
    await post(message({ creationIds: [], creationId: "" }));
    expect((await Contact.findOne().lean())!.creationIds).toEqual([]);
    expect(sellerMail()!.html).not.toContain("concernée");
  });

  it("n'ajoute rien si les créations référencées n'existent plus", async () => {
    const ghost = new mongoose.Types.ObjectId().toString();
    expect((await post(message({ creationId: ghost }))).status).toBe(201);
    expect(sellerMail()!.html).not.toContain("concernée");
  });

  it("envoie quand même l'email si la lecture des créations échoue", async () => {
    const c = await createCreation();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Creation, "find").mockRejectedValueOnce(new Error("boom") as never);
    expect((await post(message({ creationId: c._id.toString() }))).status).toBe(201);
    expect(sellerMail()).toBeDefined();
    expect(err).toHaveBeenCalledWith("Erreur lors de la récupération des créations:", expect.any(Error));
  });

  it("répond 201 même si un email échoue (le message est déjà enregistré)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    send.mockRejectedValueOnce(new Error("Resend down"));
    const email = uniqueEmail();
    expect((await post(message({ email }))).status).toBe(201);
    expect(await Contact.countDocuments({ email })).toBe(1);
    expect(err).toHaveBeenCalledWith("[contact] Email non envoyé:", expect.any(Error));
  });

  it("répond 400 sur un corps qui n'est pas du JSON", async () => {
    expect((await post("{oops")).status).toBe(400);
  });
});
