import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  email,
  idList,
  idParams,
  objectId,
  pageNumber,
  parseBody,
  parseInput,
  parseParams,
  parseQuery,
  password,
  requiredText,
  text,
} from "@/lib/validation";
import { PASSWORD_MESSAGES } from "@/lib/password-policy";
import { makeRequest } from "../../helpers/http";

const ID = "65a1b2c3d4e5f60718293a4b";

/** Réponse 400 d'une entrée refusée. */
async function rejection(result: { ok: boolean; response?: Response }) {
  expect(result.ok).toBe(false);
  const res = result.response!;
  return { status: res.status, body: await res.json() };
}

describe("parseBody", () => {
  const schema = z.object({ name: z.string(), age: z.number().optional() });
  const body = (raw: unknown) => parseBody(makeRequest("/api/test", { method: "POST", body: raw }), schema);

  it("renvoie les données validées, sans les clés inconnues", async () => {
    expect(await body({ name: "Alice", role: "admin" })).toEqual({ ok: true, data: { name: "Alice" } });
  });

  it.each([["{pas du json"], [undefined]])("répond 400 sur un corps qui n'est pas du JSON (%j)", async (raw) => {
    expect(await rejection(await body(raw))).toEqual({
      status: 400,
      body: { error: "Le corps de la requête doit être un objet JSON." },
    });
  });

  it.each([["null"], ['"texte"'], ["[1]"]])("répond 400 sur un JSON qui n'est pas un objet (%s)", async (raw) => {
    expect(await rejection(await body(raw))).toEqual({
      status: 400,
      body: { error: "Le corps de la requête doit être un objet JSON." },
    });
  });

  it("nomme un champ manquant", async () => {
    expect(await rejection(await body({}))).toEqual({
      status: 400,
      body: { error: "Champ « name » requis.", champ: "name" },
    });
  });

  it("nomme un champ invalide sans révéler la valeur reçue ni le type attendu", async () => {
    const { body: res } = await rejection(await body({ name: { $ne: null } }));
    expect(res).toEqual({ error: "Champ « name » invalide.", champ: "name" });
  });

  it("donne le chemin complet d'un champ imbriqué", async () => {
    const nested = z.object({ items: z.array(z.object({ id: objectId })) });
    const result = parseBody(makeRequest("/api/test", { method: "POST", body: { items: [{ id: "x" }] } }), nested);
    expect((await rejection(await result)).body).toEqual({ error: "Identifiant invalide.", champ: "items.0.id" });
  });

  it("garde le message propre au schéma", async () => {
    const custom = z.object({ code: z.string("Code requis.") });
    const result = parseBody(makeRequest("/api/test", { method: "POST", body: {} }), custom);
    expect((await rejection(await result)).body).toEqual({ error: "Code requis.", champ: "code" });
  });
});

describe("parseQuery", () => {
  const schema = z.object({ status: z.enum(["new", "read"]).optional(), page: pageNumber(1) });

  it("valide la query string et garde la première valeur d'une clé répétée", () => {
    expect(parseQuery(new URLSearchParams("status=read&status=new&page=3"), schema)).toEqual({
      ok: true,
      data: { status: "read", page: 3 },
    });
  });

  it("refuse une valeur hors liste", async () => {
    const { body } = await rejection(parseQuery(new URLSearchParams('status={"$ne":null}'), schema));
    expect(body).toEqual({ error: "Champ « status » invalide.", champ: "status" });
  });
});

describe("parseParams", () => {
  it("valide les paramètres d'une route dynamique", async () => {
    expect(await parseParams(Promise.resolve({ id: ID }), idParams)).toEqual({ ok: true, data: { id: ID } });
  });

  it("refuse un identifiant mal formé", async () => {
    const { body } = await rejection(await parseParams(Promise.resolve({ id: "pas-un-id" }), idParams));
    expect(body).toEqual({ error: "Identifiant invalide.", champ: "id" });
  });
});

describe("briques communes", () => {
  const ok = <S extends z.ZodType>(schema: S, value: unknown) => parseInput(schema, value);

  it("objectId : exactement 24 caractères hexadécimaux", () => {
    expect(ok(objectId, ID).ok).toBe(true);
    // 12 caractères : accepté par mongoose.isValidObjectId, refusé ici
    for (const value of ["abcdefghijkl", `${ID}0`, { $ne: null }, 42]) {
      expect(ok(objectId, value).ok).toBe(false);
    }
  });

  it("email : normalisé (espaces, minuscules) et au bon format", () => {
    expect(ok(email, "  Alice@Example.COM ")).toEqual({ ok: true, data: "alice@example.com" });
    for (const value of ["", "pas-un-email", "a @b.fr", `${"a".repeat(250)}@b.fr`, { $ne: null }]) {
      expect(ok(email, value).ok).toBe(false);
    }
  });

  it("password : chaîne non vide et bornée, message de la politique de mot de passe", async () => {
    expect(ok(password, "une phrase").ok).toBe(true);
    expect((await rejection(ok(password, 12345678))).body.error).toBe(PASSWORD_MESSAGES.required);
    expect((await rejection(ok(password, ""))).body.error).toBe(PASSWORD_MESSAGES.required);
    expect(ok(password, "x".repeat(257)).ok).toBe(false);
  });

  it("text / requiredText : trim et longueur maximale", async () => {
    expect(ok(text(5), "  abc  ")).toEqual({ ok: true, data: "abc" });
    expect((await rejection(ok(text(5), "abcdef"))).body.error).toBe(
      "Un champ dépasse la longueur maximale autorisée (5 caractères)."
    );
    expect((await rejection(ok(requiredText(5, "Titre requis."), "   "))).body.error).toBe("Titre requis.");
  });

  it("pageNumber : entier ≥ 1, valeur par défaut sinon, borné au maximum", () => {
    const schema = pageNumber(10, 100);
    expect(ok(schema, "3")).toEqual({ ok: true, data: 3 });
    expect(ok(schema, "1000")).toEqual({ ok: true, data: 100 });
    for (const value of [undefined, "0", "-2", "1.5", "abc"]) {
      expect(ok(schema, value)).toEqual({ ok: true, data: 10 });
    }
  });

  it("idList : garde les identifiants valides, ignore le reste, borne la longueur", () => {
    const schema = idList(4);
    expect(ok(schema, ` ${ID},pas-un-id,,${ID.toUpperCase()}`)).toEqual({ ok: true, data: [ID, ID.toUpperCase()] });
    expect(ok(schema, undefined)).toEqual({ ok: true, data: [] });
    expect(ok(schema, "x".repeat(101)).ok).toBe(false);
  });
});
