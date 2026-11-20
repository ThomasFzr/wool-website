import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { DELETE, GET, PATCH } from "@/app/api/creations/[id]/route";
import { connectToDatabase } from "@/lib/db";
import { cloudinary } from "@/lib/cloudinary";
import Creation from "@/models/Creation";
import ImageDeletion from "@/models/ImageDeletion";
import Reservation from "@/models/Reservation";
import { makeRequest, readJson, routeParams } from "../../../helpers/http";
import { asAdmin, asAnonymous, asUser } from "../../../helpers/session";
import { createCreation, insertRawCreation } from "../../../helpers/creations-fixtures";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));
vi.mock("@/lib/cloudinary", () => ({ cloudinary: { uploader: { destroy: vi.fn() } } }));

const destroy = vi.mocked(cloudinary.uploader.destroy);

const get = (id: string) => GET(makeRequest(`/api/creations/${id}`), routeParams({ id }));
const patch = (id: string, body: unknown) =>
  PATCH(makeRequest(`/api/creations/${id}`, { method: "PATCH", body }), routeParams({ id }));
const del = (id: string) =>
  DELETE(makeRequest(`/api/creations/${id}`, { method: "DELETE" }), routeParams({ id }));

const fresh = async (id: unknown) => (await Creation.findById(id).lean()) as any;

beforeEach(async () => {
  await connectToDatabase();
  destroy.mockResolvedValue({ result: "ok" } as any);
});

describe("GET /api/creations/[id]", () => {
  it("trouve une création par son identifiant", async () => {
    const c = await createCreation({ title: "Bonnet", description: "Doux", seoDescription: "SEO" });
    asAnonymous();
    const { status, body } = await readJson(await get(c._id.toString()));
    expect(status).toBe(200);
    expect(body).toMatchObject({
      _id: c._id.toString(),
      slug: c.slug,
      title: "Bonnet",
      description: "Doux",
      seoDescription: "SEO",
      price: 30,
      color: "Rose",
      type: "bonnet",
      sold: false,
      showAsNew: true,
      relatedCreations: [],
    });
    expect(typeof body.createdAt).toBe("string");
    // Les champs admin ne sont jamais renvoyés par cette route
    expect(body.yarnBrand).toBeUndefined();
  });

  it("trouve une création par son slug", async () => {
    await createCreation({ slug: "bonnet-rose", title: "Bonnet rose" });
    asAnonymous();
    const { status, body } = await readJson(await get("bonnet-rose"));
    expect(status).toBe(200);
    expect(body.title).toBe("Bonnet rose");
  });

  it("répond 404 pour un slug inconnu", async () => {
    asAnonymous();
    expect((await get("inconnu")).status).toBe(404);
  });

  it("cache une création masquée au visiteur mais pas à l'admin", async () => {
    const c = await createCreation({ hidden: true });
    asUser();
    expect((await get(c._id.toString())).status).toBe(404);
    asAdmin();
    expect((await get(c._id.toString())).status).toBe(200);
  });

  it("filtre les articles liés masqués pour le visiteur seulement", async () => {
    const hidden = await createCreation({ hidden: true, title: "Masqué" });
    const visible = await createCreation({ title: "Visible" });
    const c = await createCreation({ relatedCreations: [hidden._id, visible._id] });

    asAnonymous();
    const pub = await readJson(await get(c._id.toString()));
    expect(pub.body.relatedCreations.map((r: any) => r.title)).toEqual(["Visible"]);

    asAdmin();
    const adm = await readJson(await get(c._id.toString()));
    expect(adm.body.relatedCreations.map((r: any) => r.title).sort()).toEqual(["Masqué", "Visible"]);
  });

  it("tolère un document ancien sans articles liés ni date de création", async () => {
    const id = await insertRawCreation({ title: "Ancien", price: 10, color: "Noir", type: "bonnet" });
    asAnonymous();
    const { status, body } = await readJson(await get(id.toString()));
    expect(status).toBe(200);
    expect(body.relatedCreations).toEqual([]);
    expect(body.createdAt).toBeUndefined();
  });

  it("garde tel quel un champ relatedCreations qui n'est pas un tableau", async () => {
    const c = await createCreation();
    asAnonymous();
    // Simulation d'un résultat de base inattendu
    vi.spyOn(Creation, "findOne").mockReturnValue({
      populate: () => ({ lean: async () => ({ ...c.toObject(), relatedCreations: "x" }) }),
    } as any);
    const { body } = await readJson(await get(c._id.toString()));
    expect(body.relatedCreations).toBe("x");
  });

  it("répond 500 si la base échoue", async () => {
    asAnonymous();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Creation, "findOne").mockImplementation(() => {
      throw new Error("boom");
    });
    expect((await get("x")).status).toBe(500);
  });
});

describe("PATCH /api/creations/[id]", () => {
  it("refuse un visiteur non connecté", async () => {
    const c = await createCreation();
    asAnonymous();
    expect((await patch(c._id.toString(), { title: "Pirate" })).status).toBe(401);
  });

  it("refuse un utilisateur non admin", async () => {
    const c = await createCreation({ title: "Original" });
    asUser();
    expect((await patch(c._id.toString(), { title: "Pirate" })).status).toBe(401);
    expect((await fresh(c._id)).title).toBe("Original");
  });

  it("répond 404 pour une création inexistante", async () => {
    asAdmin();
    expect((await patch(new mongoose.Types.ObjectId().toString(), { title: "X" })).status).toBe(404);
  });

  it("répond 404 pour un identifiant mal formé", async () => {
    asAdmin();
    expect((await patch("pas-un-id", { title: "X" })).status).toBe(404);
  });

  it("supprime de Cloudinary les images retirées, pas celles gardées ni celles d'une autre création", async () => {
    await createCreation({ imagePublicIds: ["partagee"] });
    const c = await createCreation({ imagePublicIds: ["a", "b", "partagee"] });
    asAdmin();
    expect((await patch(c._id.toString(), { imagePublicIds: ["b"], images: ["https://img/b.jpg"] })).status).toBe(200);
    expect(destroy.mock.calls.map((call) => call[0])).toEqual(["a"]);
    const rows = await ImageDeletion.find().sort({ publicId: 1 }).lean<any[]>();
    expect(rows.map((r) => [r.publicId, r.outcome, r.source, String(r.creationId)])).toEqual([
      ["a", "deleted", "creation-update", c._id.toString()],
      ["partagee", "kept", "creation-update", c._id.toString()],
    ]);
  });

  it("ne supprime aucune image quand imagePublicIds n'est pas envoyé", async () => {
    const id = await insertRawCreation({ title: "Sans ids", price: 10, color: "Noir", type: "bonnet" });
    const c = await createCreation({ imagePublicIds: ["a"] });
    asAdmin();
    await patch(c._id.toString(), { description: "x" });
    await patch(id.toString(), { imagePublicIds: [] });
    expect(destroy).not.toHaveBeenCalled();
  });

  it.each([
    ["titre vide", { title: "  " }, /titre/],
    ["titre non textuel", { title: 4 }, /titre/],
    ["titre nul", { title: null }, /titre/],
    ["type vide", { type: "" }, /type/],
    ["type non textuel", { type: 4 }, /type/],
    ["type blanc", { type: "  " }, /type/],
    ["prix nul", { price: 0 }, /prix/],
    ["prix textuel", { price: "10" }, /prix/],
    ["prix négatif", { price: -1 }, /prix/],
    ["couleur vide", { color: "" }, /couleur/],
    ["couleur non textuelle", { color: 5 }, /couleur/],
    ["couleur blanche", { color: "   " }, /couleur/],
  ])("répond 400 : %s", async (_label, body, message) => {
    const c = await createCreation();
    asAdmin();
    const res = await readJson(await patch(c._id.toString(), body));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });

  it("valide aussi les valeurs déjà en base quand le champ n'est pas envoyé", async () => {
    const id = await insertRawCreation({ title: "Sans couleur", price: 10, type: "bonnet", hidden: false });
    asAdmin();
    const res = await readJson(await patch(id.toString(), { description: "x" }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/couleur/);
  });

  it("nettoie la description SEO (rendue en HTML) à l'enregistrement", async () => {
    const c = await createCreation();
    asAdmin();
    await patch(c._id.toString(), { seoDescription: '<p onclick="x()">Doux</p><iframe src="https://evil.example"></iframe>' });
    expect((await fresh(c._id)).seoDescription).toBe("<p>Doux</p>");
  });

  it("garde les anciens slugs d'une création renommée pour rediriger les anciens liens", async () => {
    const c = await createCreation({ title: "Bonnet", slug: "bonnet" });
    asAdmin();
    await patch(c._id.toString(), { title: "Bonnet rose" });
    expect(await fresh(c._id)).toMatchObject({ slug: "bonnet-rose", previousSlugs: ["bonnet"] });

    // Même titre : rien ne change
    await patch(c._id.toString(), { title: "Bonnet rose" });
    expect((await fresh(c._id)).previousSlugs).toEqual(["bonnet"]);

    await patch(c._id.toString(), { title: "Bonnet bleu" });
    expect(await fresh(c._id)).toMatchObject({ slug: "bonnet-bleu", previousSlugs: ["bonnet", "bonnet-rose"] });

    // Retour à un ancien titre : le slug est repris et sort de l'historique
    await patch(c._id.toString(), { title: "Bonnet" });
    expect(await fresh(c._id)).toMatchObject({ slug: "bonnet", previousSlugs: ["bonnet-rose", "bonnet-bleu"] });
  });

  it("n'ajoute pas d'ancien slug à une création qui n'en avait pas", async () => {
    const id = await insertRawCreation({ title: "Vieux", price: 10, type: "bonnet", color: "Rouge" });
    asAdmin();
    await patch(id.toString(), { title: "Neuf" });
    expect(await fresh(id)).toMatchObject({ slug: "neuf", previousSlugs: [] });
  });

  it("met à jour les champs simples, nettoie les textes et régénère le slug", async () => {
    await createCreation({ slug: "nouveau-titre" });
    const related = await createCreation();
    const c = await createCreation({ title: "Ancien titre" });
    asAdmin();

    const { status, body } = await readJson(
      await patch(c._id.toString(), {
        title: "  Nouveau titre ",
        description: "Desc",
        seoDescription: "SEO",
        imageUrl: "https://img/a.jpg",
        images: ["https://img/a.jpg"],
        imagePublicIds: ["a"],
        price: 42,
        color: " Bleu ",
        type: " bandeau ",
        yarnBrand: "Phildar",
        weight: 80,
        yarnPrice: 3,
        reserved: true,
        reservedName: "Alice",
        reservedContact: "alice@example.com",
        reservedMessage: "Pour moi",
        reservedAt: "2026-01-01T00:00:00.000Z",
        showAsNew: false,
        displayOrder: 9,
        relatedCreations: [related._id.toString()],
      })
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      title: "Nouveau titre",
      slug: "nouveau-titre-1",
      description: "Desc",
      seoDescription: "SEO",
      imageUrl: "https://img/a.jpg",
      images: ["https://img/a.jpg"],
      imagePublicIds: ["a"],
      price: 42,
      color: "Bleu",
      type: "bandeau",
      yarnBrand: "Phildar",
      weight: 80,
      yarnPrice: 3,
      reserved: true,
      reservedName: "Alice",
      reservedContact: "alice@example.com",
      reservedMessage: "Pour moi",
      reservedAt: "2026-01-01T00:00:00.000Z",
      showAsNew: false,
      displayOrder: 9,
      relatedCreations: [related._id.toString()],
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("vide la miniature quand toutes les images sont supprimées", async () => {
    const c = await createCreation({ imageUrl: "https://img/a.jpg", images: ["https://img/a.jpg"] });
    asAdmin();
    await patch(c._id.toString(), { images: [] });
    const doc = await fresh(c._id);
    expect(doc.images).toEqual([]);
    expect(doc.imageUrl).toBe("");
  });

  it("marque vendu sans toucher salesCount (seules les commandes comptent les ventes)", async () => {
    const c = await createCreation({ salesCount: 1 });
    asAdmin();
    await patch(c._id.toString(), { sold: true });
    const doc = await fresh(c._id);
    expect(doc.sold).toBe(true);
    expect(doc.salesCount).toBe(1);
  });

  it("ne gonfle pas salesCount sur une bascule vendu → disponible → vendu", async () => {
    const c = await createCreation({ sold: true, salesCount: 1 });
    asAdmin();
    await patch(c._id.toString(), { sold: false });
    await patch(c._id.toString(), { sold: true });
    expect((await fresh(c._id)).salesCount).toBe(1);
  });

  it("efface la réservation quand l'article redevient disponible", async () => {
    const c = await createCreation({
      sold: true,
      reserved: true,
      reservedName: "Alice",
      reservedContact: "alice@example.com",
      reservedMessage: "Merci",
      reservedAt: new Date(),
      reservedByReservationId: new mongoose.Types.ObjectId(),
    });
    asAdmin();
    await patch(c._id.toString(), { sold: false });
    const doc = await fresh(c._id);
    expect(doc.sold).toBe(false);
    expect(doc.reserved).toBe(false);
    expect(doc.reservedName).toBeUndefined();
    expect(doc.reservedContact).toBeUndefined();
    expect(doc.reservedMessage).toBeUndefined();
    expect(doc.reservedAt).toBeUndefined();
    expect(doc.reservedByReservationId).toBeUndefined();
  });

  it("oublie la réservation détentrice quand l'admin lève le verrou à la main", async () => {
    const c = await createCreation({ reserved: true, reservedByReservationId: new mongoose.Types.ObjectId() });
    asAdmin();
    await patch(c._id.toString(), { reserved: false });
    const doc = await fresh(c._id);
    expect(doc.reserved).toBe(false);
    expect(doc.reservedByReservationId).toBeUndefined();
  });

  it("relance le badge « nouveau » à la demande", async () => {
    const c = await createCreation({ showAsNew: false });
    asAdmin();
    await patch(c._id.toString(), { resetNewTimer: true });
    const doc = await fresh(c._id);
    expect(doc.showAsNew).toBe(true);
    expect(doc.visibleAt).toBeInstanceOf(Date);
  });

  it("date la mise en ligne quand un article masqué est dévoilé", async () => {
    const c = await createCreation({ hidden: true });
    asAdmin();
    await patch(c._id.toString(), { hidden: false });
    const doc = await fresh(c._id);
    expect(doc.hidden).toBe(false);
    expect(doc.visibleAt).toBeInstanceOf(Date);
  });

  it("ne date pas la mise en ligne quand on masque un article", async () => {
    const c = await createCreation({ hidden: false });
    asAdmin();
    await patch(c._id.toString(), { hidden: true });
    const doc = await fresh(c._id);
    expect(doc.hidden).toBe(true);
    expect(doc.visibleAt).toBeUndefined();
  });

  it("ne date pas la mise en ligne si l'article était déjà visible", async () => {
    const c = await createCreation({ hidden: false });
    asAdmin();
    await patch(c._id.toString(), { hidden: false });
    expect((await fresh(c._id)).visibleAt).toBeUndefined();
  });

  it("renvoie la création telle quelle quand il n'y a rien à modifier", async () => {
    const c = await createCreation({ title: "Inchangé" });
    asAdmin();
    const { status, body } = await readJson(await patch(c._id.toString(), {}));
    expect(status).toBe(200);
    expect(body.title).toBe("Inchangé");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("répond 404 si la création disparaît pendant la mise à jour", async () => {
    const c = await createCreation();
    asAdmin();
    vi.spyOn(Creation, "updateOne").mockResolvedValueOnce({ matchedCount: 0 } as any);
    expect((await patch(c._id.toString(), { description: "x" })).status).toBe(404);
  });

  it("répond 404 si la création disparaît avant la relecture", async () => {
    const c = await createCreation();
    asAdmin();
    const realFindById = Creation.findById.bind(Creation);
    vi.spyOn(Creation, "findById")
      .mockImplementationOnce(realFindById)
      .mockImplementationOnce((() => Promise.resolve(null)) as any);
    expect((await patch(c._id.toString(), { description: "x" })).status).toBe(404);
  });

  it("applique les validateurs du schéma : valeur négative ou non convertible → 400", async () => {
    const c = await createCreation({ weight: 80 });
    asAdmin();
    for (const body of [{ weight: -5 }, { yarnPrice: -1 }, { weight: "lourd" }]) {
      const { status, body: res } = await readJson(await patch(c._id.toString(), body));
      expect(status).toBe(400);
      expect(res.error).toBe("Données invalides");
    }
    expect((await fresh(c._id)).weight).toBe(80);
  });

  it("répond 500 sur un corps JSON invalide", async () => {
    const c = await createCreation();
    asAdmin();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await patch(c._id.toString(), "{oops")).status).toBe(500);
  });
});

describe("DELETE /api/creations/[id]", () => {
  it("refuse un visiteur non connecté", async () => {
    const c = await createCreation();
    asAnonymous();
    expect((await del(c._id.toString())).status).toBe(401);
    expect(await Creation.countDocuments()).toBe(1);
  });

  it("refuse un utilisateur non admin", async () => {
    const c = await createCreation();
    asUser();
    expect((await del(c._id.toString())).status).toBe(401);
    expect(await Creation.countDocuments()).toBe(1);
  });

  it("répond 404 pour une création inexistante", async () => {
    asAdmin();
    expect((await del(new mongoose.Types.ObjectId().toString())).status).toBe(404);
  });

  it("supprime la création, ses images Cloudinary et ses réservations", async () => {
    const c = await createCreation({ imagePublicIds: ["img/a", "", "img/b"] });
    const other = await createCreation();
    await Reservation.create({ creationId: c._id, paymentStatus: "failed", status: "cancelled" });
    await Reservation.create({ creationId: c._id, paymentStatus: "refunded" });
    await Reservation.create({ creationId: other._id, paymentStatus: "paid" });
    asAdmin();
    vi.spyOn(console, "error").mockImplementation(() => {});
    destroy.mockResolvedValueOnce({} as any).mockRejectedValueOnce(new Error("cloudinary down"));

    const res = await del(c._id.toString());

    expect(res.status).toBe(204);
    expect(destroy).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenCalledWith("img/a", { invalidate: true });
    expect(destroy).toHaveBeenCalledWith("img/b", { invalidate: true });
    expect(await Creation.findById(c._id)).toBeNull();
    expect(await Reservation.countDocuments({ creationId: c._id })).toBe(0);
    expect(await Reservation.countDocuments({ creationId: other._id })).toBe(1);
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("garde les images encore utilisées par une autre création (doublon d'un double envoi)", async () => {
    // Deux créations nées du même formulaire partagent leurs images : supprimer le doublon
    // ne doit pas casser la photo de celle qui reste (ANO-2026-11-03).
    const doublon = await createCreation({ imagePublicIds: ["img/partagee", "img/propre"] });
    const restante = await createCreation({ imagePublicIds: ["img/partagee"] });
    asAdmin();

    expect((await del(doublon._id.toString())).status).toBe(204);

    expect(destroy.mock.calls.map((call) => call[0])).toEqual(["img/propre"]);
    expect(await Creation.findById(restante._id)).not.toBeNull();

    // Journal des suppressions : chemin, création, admin et issue de chaque image
    const rows = await ImageDeletion.find().sort({ publicId: 1 }).lean<any[]>();
    expect(rows.map((r) => [r.publicId, r.outcome, r.source, String(r.creationId), r.by])).toEqual([
      ["img/partagee", "kept", "creation-delete", doublon._id.toString(), "admin@example.com"],
      ["img/propre", "deleted", "creation-delete", doublon._id.toString(), "admin@example.com"],
    ]);
  });

  it("garde l'image d'une ancienne création si une autre création affiche encore son URL", async () => {
    const url = "https://res.cloudinary.com/demo/image/upload/v1/partagee.jpg";
    const ancienne = await createCreation({
      imageUrl: url,
      images: [url, "https://res.cloudinary.com/demo/image/upload/propre.jpg"],
    });
    await createCreation({ images: [url] });
    // Très ancien document : images à null, seule imageUrl renseignée
    await insertRawCreation({ title: "Vieux", price: 1, color: "Noir", type: "bonnet", imageUrl: url, images: null });
    asAdmin();

    expect((await del(ancienne._id.toString())).status).toBe(204);
    expect(destroy.mock.calls.map((call) => call[0])).toEqual(["propre"]);
  });

  it("refuse de supprimer une création qui a des commandes payées (à masquer à la place)", async () => {
    const c = await createCreation({ sold: true, imagePublicIds: ["img/a"] });
    await Reservation.create({ creationId: c._id, paymentStatus: "paid", status: "delivered" });
    asAdmin();

    const { status, body } = await readJson(await del(c._id.toString()));

    expect(status).toBe(409);
    expect(body.error).toMatch(/commandes payées/);
    expect(await Creation.findById(c._id)).not.toBeNull();
    expect(await Reservation.countDocuments({ creationId: c._id })).toBe(1);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("refuse de supprimer une création verrouillée par un paiement en cours", async () => {
    const c = await createCreation({ reserved: true, reservedAt: new Date() });
    await Reservation.create({ creationId: c._id, paymentStatus: "pending" });
    asAdmin();

    const { status, body } = await readJson(await del(c._id.toString()));

    expect(status).toBe(409);
    expect(body.error).toMatch(/paiement est en cours/);
    expect(await Creation.findById(c._id)).not.toBeNull();
    expect(await Reservation.countDocuments({ creationId: c._id })).toBe(1);
  });

  it("déduit les public_id depuis les URL pour les anciennes créations", async () => {
    const c = await createCreation({
      imageUrl: "https://res.cloudinary.com/demo/image/upload/v123/dossier/a.webp",
      images: ["https://res.cloudinary.com/demo/image/upload/b.jpg", "https://ailleurs.example/c.jpg"],
    });
    asAdmin();
    vi.spyOn(console, "error").mockImplementation(() => {});
    destroy.mockResolvedValueOnce({} as any).mockRejectedValueOnce(new Error("échec"));

    expect((await del(c._id.toString())).status).toBe(204);
    expect(destroy.mock.calls.map((call) => call[0])).toEqual(["dossier/a", "b"]);
  });

  it("gère les champs d'images nuls des très anciens documents", async () => {
    const id = await insertRawCreation({
      title: "Vieux",
      price: 1,
      color: "Noir",
      type: "bonnet",
      imagePublicIds: null,
      images: null,
      imageUrl: "https://res.cloudinary.com/demo/image/upload/vieux.jpg",
    });
    asAdmin();
    expect((await del(id.toString())).status).toBe(204);
    expect(destroy.mock.calls.map((call) => call[0])).toEqual(["vieux"]);
  });

  it("n'appelle pas Cloudinary pour une création sans image", async () => {
    const c = await createCreation();
    asAdmin();
    expect((await del(c._id.toString())).status).toBe(204);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("répond 404 pour un identifiant mal formé", async () => {
    asAdmin();
    expect((await del("pas-un-id")).status).toBe(404);
  });

  it("répond 500 si la base échoue", async () => {
    asAdmin();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Creation, "findById").mockRejectedValueOnce(new Error("db down"));
    expect((await del(new mongoose.Types.ObjectId().toString())).status).toBe(500);
  });
});
