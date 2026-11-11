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
const post = (body: unknown) => POST(makeRequest("/api/contact", { method: "POST", body }));

// Le rate limiting est un état de module partagé par tout le fichier : un email distinct par test
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
    ["mot-clé", "Gagnez au casino"],
    ["domaine suspect", "Voir http://promo.ru/x"],
    ["lien HTML", '<a href="x">ici</a>'],
    ["longue suite de chiffres", "Appelez le 06123456789"],
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
});

describe("POST /api/contact — rate limiting", () => {
  it("bloque le 4e message d'un même email dans la minute, quelle que soit la casse", async () => {
    const email = uniqueEmail();
    for (let i = 0; i < 3; i++) {
      expect((await post(message({ email: i === 1 ? email.toUpperCase() : email }))).status).toBe(201);
    }
    const { status, body } = await readJson(await post(message({ email })));
    expect(status).toBe(429);
    expect(body.error).toMatch(/Trop de messages/);
  });

  it("compte par utilisateur connecté plutôt que par email", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    asUser("client@example.com", { id: userId });
    for (let i = 0; i < 3; i++) {
      expect((await post(message())).status).toBe(201);
    }
    expect((await post(message())).status).toBe(429);
  });

  it("réautorise l'envoi une fois la fenêtre d'une minute écoulée", async () => {
    const email = uniqueEmail();
    const start = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(start);
    for (let i = 0; i < 3; i++) await post(message({ email }));
    expect((await post(message({ email }))).status).toBe(429);

    now.mockReturnValue(start + 60_001);
    expect((await post(message({ email }))).status).toBe(201);
  });
});

describe("POST /api/contact — enregistrement et emails", () => {
  it("enregistre le message et prévient la vendeuse et l'expéditeur", async () => {
    const email = uniqueEmail();
    const { status, body } = await readJson(
      await post(message({ email, name: "<b>Alice</b>", subject: "Sujet & co" }))
    );

    expect(status).toBe(201);
    expect(body).toMatchObject({ email, status: "new", creationId: null, userId: null });
    expect(await Contact.countDocuments({ email })).toBe(1);

    expect(send).toHaveBeenCalledTimes(2);
    const seller = sellerMail()!;
    expect(seller.subject).toBe("📧 Nouveau message : Sujet & co");
    expect(seller.html).toContain("&lt;b&gt;Alice&lt;/b&gt;");
    expect(seller.html).not.toContain("<b>Alice</b>");
    expect(seller.html).toContain("https://boutique.example/admin/contact");
    expect(seller.html).not.toContain("concernée");

    const confirmation = send.mock.calls.find((c) => c[0].to === email)![0];
    expect(confirmation.subject).toMatch(/bien été reçu/);
    expect(confirmation.html).toContain("Sujet &amp; co");
  });

  it("rattache le message à l'utilisateur connecté", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    asUser("client@example.com", { id: userId });
    const { body } = await readJson(await post(message()));
    expect(body.userId).toBe(userId);
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
      imageUrl: "https://img/bonnet.jpg",
      price: 25,
      color: "Rose",
    });
    const { body } = await readJson(await post(message({ creationId: c._id.toString() })));

    expect(body.creationId).toBe(c._id.toString());
    expect(body.creationIds).toEqual([c._id.toString()]);
    const html = sellerMail()!.html;
    expect(html).toContain("Création concernée :");
    expect(html).toContain('src="https://img/bonnet.jpg"');
    expect(html).toContain("Bonnet &lt;rose&gt;");
    expect(html).toContain("Prix : 25€");
    expect(html).toContain("Couleur : Rose");
    expect(html).toContain("Disponible");
  });

  it("décrit plusieurs créations (creationIds) avec leur statut", async () => {
    const vendue = await createCreation({ sold: true, images: ["https://img/galerie.jpg"] });
    const reservee = await createCreation({ reserved: true, price: 0 });
    const sansCouleur = await insertRawCreation({ title: "Sans couleur", price: 3, type: "bonnet" });
    const ids = [vendue._id.toString(), reservee._id.toString(), sansCouleur.toString()];

    const { body } = await readJson(await post(message({ creationIds: ids, creationId: ids[0] })));

    expect(body.creationIds).toEqual(ids);
    const html = sellerMail()!.html;
    expect(html).toContain("Créations concernées :");
    expect(html).toContain('src="https://img/galerie.jpg"');
    expect(html).toContain("Vendu");
    expect(html).toContain("Réservé");
    expect(html).not.toContain("Prix : 0€");
    expect(html).toContain("Sans couleur");
  });

  it("ignore un tableau creationIds vide", async () => {
    const { body } = await readJson(await post(message({ creationIds: [] })));
    expect(body.creationIds).toEqual([]);
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

  it("répond 500 pour un identifiant de création mal formé", async () => {
    // BUG: creationId n'est pas validé : un identifiant invalide fait échouer Contact.create (500)
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, body } = await readJson(await post(message({ creationId: "pas-un-id" })));
    expect(status).toBe(500);
    expect(body.error).toMatch(/Erreur lors de l'envoi/);
    expect(send).not.toHaveBeenCalled();
  });

  it("répond 500 sur un corps JSON invalide", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post("{oops")).status).toBe(500);
  });
});
