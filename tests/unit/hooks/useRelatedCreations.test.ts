// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { useRelatedCreations } from "@/hooks/useRelatedCreations";
import type { CartItem } from "@/contexts/CartContext";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const items: CartItem[] = [
  { creationId: "a1", title: "Bonnet" },
  { creationId: "b2", title: "Écharpe" },
];

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useRelatedCreations", () => {
  it("récupère en un seul appel les articles liés à tous les ids du panier", async () => {
    const related = [{ _id: "c3", title: "Mitaines" }];
    fetchMock.mockResolvedValue(jsonResponse(related));

    const { result } = renderHook(() => useRelatedCreations(items));

    await waitFor(() => expect(result.current).toEqual(related));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`/api/creations/related?ids=${encodeURIComponent("a1,b2")}`);
  });

  it("ne refait pas d'appel quand le tableau change d'identité mais pas d'ids", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    const { rerender } = renderHook(({ list }) => useRelatedCreations(list), {
      initialProps: { list: items },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender({ list: [...items] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retourne une liste vide sans appel quand le panier est vide", () => {
    const { result } = renderHook(() => useRelatedCreations([]));
    expect(result.current).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retourne une liste vide sans appel quand désactivé, et vide la liste précédente", async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ _id: "c3", title: "Mitaines" }]));
    const { result, rerender } = renderHook(({ enabled }) => useRelatedCreations(items, enabled), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(result.current).toHaveLength(1));

    rerender({ enabled: false });
    expect(result.current).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retourne une liste vide si la réponse HTTP est en erreur", async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ _id: "x", title: "x" }], false));
    const { result } = renderHook(() => useRelatedCreations(items));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toEqual([]);
  });

  it("retourne une liste vide si la réponse n'est pas un tableau", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "oops" }));
    const { result } = renderHook(() => useRelatedCreations(items));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toEqual([]);
  });

  it("journalise l'erreur réseau et retourne une liste vide", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("réseau"));
    const { result } = renderHook(() => useRelatedCreations(items));
    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });

  it("ignore une réponse arrivée après le démontage", async () => {
    const d = deferred<Response>();
    fetchMock.mockReturnValue(d.promise);
    const { result, unmount } = renderHook(() => useRelatedCreations(items));
    const last = result.current;
    unmount();
    d.resolve(jsonResponse([{ _id: "c3", title: "Mitaines" }]));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toBe(last);
  });

  it("ignore une erreur arrivée après le démontage (sans la masquer dans la console)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deferred<Response>();
    fetchMock.mockReturnValue(d.promise);
    const { result, unmount } = renderHook(() => useRelatedCreations(items));
    unmount();
    d.reject(new Error("réseau"));
    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });

  it("ne garde que la réponse la plus récente quand les ids changent", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(({ list }) => useRelatedCreations(list), {
      initialProps: { list: items },
    });
    rerender({ list: [items[0]] });

    second.resolve(jsonResponse([{ _id: "new", title: "Nouveau" }]));
    await waitFor(() => expect(result.current).toEqual([{ _id: "new", title: "Nouveau" }]));

    first.resolve(jsonResponse([{ _id: "old", title: "Ancien" }]));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toEqual([{ _id: "new", title: "Nouveau" }]);
  });
});
