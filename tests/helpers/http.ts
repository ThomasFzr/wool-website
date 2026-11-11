import { NextRequest } from "next/server";

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

/** Construit une NextRequest comme celles reçues par les routes API. */
export function makeRequest(path: string, { method = "GET", body, headers = {} }: RequestOptions = {}) {
  const init: ConstructorParameters<typeof NextRequest>[1] = { method, headers: { host: "localhost:3000", ...headers } };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    (init.headers as Record<string, string>)["content-type"] ??= "application/json";
  }
  return new NextRequest(new URL(path, "http://localhost:3000"), init);
}

/** Paramètres de route dynamique au format Next 16 (Promise). */
export function routeParams<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

export async function readJson(res: Response) {
  return { status: res.status, body: await res.json() };
}
