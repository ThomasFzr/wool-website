import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { GET, POST } from "@/app/api/creations/route";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import { makeRequest, readJson } from "../../../helpers/http";
import { asAdmin, asAnonymous, asUser } from "../../../helpers/session";
import { createCreation, insertRawCreation } from "../../../helpers/creations-fixtures";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));

const get = () => GET(makeRequest("/api/creations"));
const post = (body: unknown) => POST(makeRequest("/api/creations", { method: "POST", body }));

const valid = { title: "  Bonnet Été  ", type: " bonnet ", price: 25, color: " Rose " };

beforeEach(async () => {
  await connectToDatabase();
});

describe("GET /api/creations", () => {
  it("cache aux visiteurs les créations masquées, les champs admin et les articles liés masqués", async () => {
    const hiddenRelated = await createCreation({ hidden: true, title: "Lié masqué" });
    const visibleRelated = await createCreation({ title: "Lié visible" });
    await createCreation({
      title: "Visible",
      yarnBrand: "Phildar",
      weight: 100,
      yarnPrice: 4,
      relatedCreations: [hiddenRelated._id, visibleRelated._id],
    });
    asAnonymous();

    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    expect(body.map((c: any) => c.title).sort()).toEqual(["Lié visible", "Visible"]);
    const main = body.find((c: any) => c.title === "Visible");
    expect(main.yarnBrand).toBeUndefined();
    expect(main.weight).toBeUndefined();
    expect(main.yarnPrice).toBeUndefined();
    expect(main.relatedCreations.map((r: any) => r.title)).toEqual(["Lié visible"]);
  });

  it("traite aussi un utilisateur non admin comme un visiteur", async () => {
    await createCreation({ hidden: true });
    asUser();
    const { body } = await readJson(await get());
    expect(body).toEqual([]);
  });

  it("tolère une création sans champ relatedCreations", async () => {
    await insertRawCreation({ title: "Ancienne", price: 10, color: "Noir", type: "bonnet" });
    asAnonymous();
    const { body } = await readJson(await get());
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Ancienne");
  });

  it("montre tout à l'admin, trié par displayOrder décroissant", async () => {
    const hiddenRelated = await createCreation({ hidden: true, title: "Lié masqué", displayOrder: 1 });
    await createCreation({
      title: "Premier",
      displayOrder: 5,
      yarnBrand: "Phildar",
      relatedCreations: [hiddenRelated._id],
    });
    asAdmin();

    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    expect(body.map((c: any) => c.title)).toEqual(["Premier", "Lié masqué"]);
    expect(body[0].yarnBrand).toBe("Phildar");
    expect(body[0].relatedCreations).toHaveLength(1);
  });

  it("répond 500 si la base échoue", async () => {
    asAnonymous();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Creation, "find").mockImplementation(() => {
      throw new Error("boom");
    });
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("DB error");
  });
});

describe("POST /api/creations", () => {
  it("refuse un visiteur non connecté", async () => {
    asAnonymous();
    expect((await post(valid)).status).toBe(401);
  });

  it("refuse un utilisateur non admin", async () => {
    asUser();
    expect((await post(valid)).status).toBe(401);
    expect(await Creation.countDocuments()).toBe(0);
  });

  it.each([
    ["titre absent", { ...valid, title: undefined }, /titre/],
    ["titre non textuel", { ...valid, title: 12 }, /titre/],
    ["titre vide", { ...valid, title: "   " }, /titre/],
    ["type absent", { ...valid, type: undefined }, /type/],
    ["type non textuel", { ...valid, type: 3 }, /type/],
    ["type vide", { ...valid, type: " " }, /type/],
    ["prix absent", { ...valid, price: undefined }, /prix/],
    ["prix textuel", { ...valid, price: "25" }, /prix/],
    ["prix négatif", { ...valid, price: -5 }, /prix/],
    ["couleur absente", { ...valid, color: undefined }, /couleur/],
    ["couleur non textuelle", { ...valid, color: 1 }, /couleur/],
    ["couleur vide", { ...valid, color: "  " }, /couleur/],
  ])("répond 400 : %s", async (_label, body, message) => {
    asAdmin();
    const res = await readJson(await post(body));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
    expect(await Creation.countDocuments()).toBe(0);
  });

  it("crée une création masquée par défaut avec slug, ordre et champs nettoyés", async () => {
    asAdmin();
    const { status, body } = await readJson(await post(valid));

    expect(status).toBe(201);
    expect(body).toMatchObject({
      title: "Bonnet Été",
      slug: "bonnet-ete",
      type: "bonnet",
      color: "Rose",
      price: 25,
      displayOrder: 1,
      showAsNew: true,
      hidden: true,
      images: [],
      imagePublicIds: [],
      relatedCreations: [],
    });
    expect(body.imageUrl).toBeUndefined();
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(await Creation.countDocuments()).toBe(1);
  });

  it("place la nouvelle création après le plus grand displayOrder existant", async () => {
    await createCreation({ displayOrder: 7 });
    asAdmin();
    const { body } = await readJson(await post(valid));
    expect(body.displayOrder).toBe(8);
  });

  it("compte un displayOrder existant nul comme 0", async () => {
    await createCreation({ displayOrder: 0 });
    asAdmin();
    const { body } = await readJson(await post(valid));
    expect(body.displayOrder).toBe(1);
  });

  it("utilise la première image comme miniature et conserve les options fournies", async () => {
    const related = await createCreation();
    asAdmin();
    const { status, body } = await readJson(
      await post({
        ...valid,
        description: "Doux",
        seoDescription: "SEO",
        images: ["https://img/a.jpg", "https://img/b.jpg"],
        imagePublicIds: ["a", "b"],
        showAsNew: false,
        hidden: false,
        yarnBrand: "Phildar",
        weight: 120,
        yarnPrice: 6,
        relatedCreations: [related._id.toString()],
      })
    );

    expect(status).toBe(201);
    expect(body).toMatchObject({
      description: "Doux",
      seoDescription: "SEO",
      imageUrl: "https://img/a.jpg",
      images: ["https://img/a.jpg", "https://img/b.jpg"],
      imagePublicIds: ["a", "b"],
      showAsNew: false,
      hidden: false,
      yarnBrand: "Phildar",
      weight: 120,
      yarnPrice: 6,
      relatedCreations: [related._id.toString()],
    });
  });

  it("construit la galerie à partir de imageUrl seule", async () => {
    asAdmin();
    const { body } = await readJson(await post({ ...valid, imageUrl: "https://img/seule.jpg", images: [] }));
    expect(body.imageUrl).toBe("https://img/seule.jpg");
    expect(body.images).toEqual(["https://img/seule.jpg"]);
  });

  it("génère un slug unique quand le titre existe déjà", async () => {
    await createCreation({ slug: "bonnet-ete" });
    asAdmin();
    const { body } = await readJson(await post(valid));
    expect(body.slug).toBe("bonnet-ete-1");
  });

  it("répond 500 sur un corps JSON invalide", async () => {
    asAdmin();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post("{pas du json");
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("DB error");
  });
});
