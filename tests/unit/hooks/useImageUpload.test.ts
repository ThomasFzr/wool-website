// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, act, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import type { ChangeEvent } from "react";

async function loadHook() {
  const { useImageUpload } = await import("@/hooks/useImageUpload");
  return renderHook(() => useImageUpload());
}

const SIGNATURE = { cloudName: "demo", apiKey: "key-1", signature: "sig", timestamp: 1700000000 };

/** Route de signature puis Cloudinary : `upload` répond pour chaque fichier. */
function mockUpload(
  upload: (init: RequestInit) => unknown,
  signature: { ok: boolean; body?: unknown } = { ok: true, body: SIGNATURE }
) {
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    if (url === "/api/admin/cloudinary-signature") {
      return { ok: signature.ok, json: async () => signature.body };
    }
    return upload(init);
  });
}
const uploadCalls = () => fetchMock.mock.calls.filter(([url]) => url !== "/api/admin/cloudinary-signature");

const fetchMock = vi.fn();
const elementFromPoint = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  document.elementFromPoint = elementFromPoint;
  elementFromPoint.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function changeEvent(files: File[] | null) {
  const target = { files, value: "C:\\fakepath\\photo.jpg" };
  return { target } as unknown as ChangeEvent<HTMLInputElement> & { target: { value: string } };
}

const file = (name: string) => new File(["x"], name, { type: "image/jpeg" });

describe("useImageUpload — envoi des images", () => {
  it("envoie chaque fichier à Cloudinary avec une signature du serveur et renvoie urls et publicIds dans l'ordre", async () => {
    mockUpload((init) => {
      const name = ((init.body as FormData).get("file") as File).name;
      return { ok: true, json: async () => ({ secure_url: `https://cdn/${name}`, public_id: `id-${name}` }) };
    });
    const { result } = await loadHook();
    const onDone = vi.fn();
    const e = changeEvent([file("1.jpg"), file("2.jpg")]);

    await act(() => result.current.handleImageChange(e, onDone));

    // Une seule signature pour tout le lot
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/cloudinary-signature", { method: "POST" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, init] = uploadCalls()[0];
    expect(url).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect(body.get("api_key")).toBe("key-1");
    expect(body.get("timestamp")).toBe("1700000000");
    expect(body.get("signature")).toBe("sig");
    expect(body.has("upload_preset")).toBe(false);
    expect(onDone).toHaveBeenCalledWith(["https://cdn/1.jpg", "https://cdn/2.jpg"], ["id-1.jpg", "id-2.jpg"]);
    expect(e.target.value).toBe("");
    expect(result.current.uploading).toBe(false);
  });

  it("transmet le preset signé par le serveur", async () => {
    mockUpload(() => ({ ok: true, json: async () => ({ secure_url: "u", public_id: "p" }) }), {
      ok: true,
      body: { ...SIGNATURE, upload_preset: "signed-preset" },
    });
    const { result } = await loadHook();
    await act(() => result.current.handleImageChange(changeEvent([file("1.jpg")]), vi.fn()));
    expect((uploadCalls()[0][1].body as FormData).get("upload_preset")).toBe("signed-preset");
  });

  it("indique l'envoi en cours pendant l'upload", async () => {
    let finish!: () => void;
    mockUpload(
      () =>
        new Promise((res) => {
          finish = () => res({ ok: true, json: async () => ({ secure_url: "u", public_id: "p" }) });
        })
    );
    const { result } = await loadHook();
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleImageChange(changeEvent([file("1.jpg")]), vi.fn());
    });
    expect(result.current.uploading).toBe(true);
    await waitFor(() => expect(finish).toBeDefined());
    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.uploading).toBe(false);
  });

  it.each([
    ["aucune liste de fichiers", null],
    ["liste vide", []],
  ])("ne fait rien sans fichier (%s)", async (_label, files) => {
    const { result } = await loadHook();
    const onDone = vi.fn();
    await act(() => result.current.handleImageChange(changeEvent(files), onDone));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("n'envoie rien à Cloudinary si le serveur refuse la signature (non admin, Cloudinary non configuré)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockUpload(() => ({ ok: true, json: async () => ({}) }), { ok: false, body: { error: "Non autorisé" } });
    const { result } = await loadHook();
    const onDone = vi.fn();
    await act(async () => {
      await expect(result.current.handleImageChange(changeEvent([file("1.jpg")]), onDone)).rejects.toThrow(
        "Erreur lors de l'upload des images."
      );
    });
    expect(uploadCalls()).toHaveLength(0);
    expect(onDone).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    expect(result.current.uploading).toBe(false);
  });

  it("lève une erreur générique si Cloudinary refuse un fichier, sans appeler le callback", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockUpload(() => ({ ok: false, json: async () => ({}) }));
    const { result } = await loadHook();
    const onDone = vi.fn();
    const e = changeEvent([file("1.jpg")]);

    await act(async () => {
      await expect(result.current.handleImageChange(e, onDone)).rejects.toThrow(
        "Erreur lors de l'upload des images."
      );
    });
    expect(onDone).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    expect(e.target.value).not.toBe("");
    expect(result.current.uploading).toBe(false);
  });
});

describe("useImageUpload — réordonnancement souris", () => {
  const images = ["i0", "i1", "i2"];
  const ids = ["p0", "p1", "p2"];
  const dragEvent = () => ({ preventDefault: vi.fn() }) as unknown as React.DragEvent<HTMLDivElement>;

  it("déplace l'image et son publicId ensemble", async () => {
    const { result } = await loadHook();
    const onReorder = vi.fn();
    act(() => result.current.handleDragStart(0));
    const e = dragEvent();
    act(() => result.current.handleDragOver(e, 2, onReorder, images, ids));
    expect(e.preventDefault).toHaveBeenCalled();
    expect(onReorder).toHaveBeenCalledWith(["i1", "i2", "i0"], ["p1", "p2", "p0"]);
    expect(result.current.dragIndex).toBe(2);
  });

  it("ne fait rien sans glissement en cours ou sur sa propre position", async () => {
    const { result } = await loadHook();
    const onReorder = vi.fn();
    act(() => result.current.handleDragOver(dragEvent(), 1, onReorder, images, ids));
    act(() => result.current.handleDragStart(1));
    act(() => result.current.handleDragOver(dragEvent(), 1, onReorder, images, ids));
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("réinitialise l'index à la fin du glissement", async () => {
    const { result } = await loadHook();
    act(() => result.current.handleDragStart(1));
    act(() => result.current.handleDragEnd());
    expect(result.current.dragIndex).toBeNull();
  });
});

describe("useImageUpload — réordonnancement tactile", () => {
  const images = ["i0", "i1", "i2"];
  const ids = ["p0", "p1", "p2"];
  const touch = () =>
    ({ touches: [{ clientX: 5, clientY: 7 }] }) as unknown as React.TouchEvent<HTMLDivElement>;

  function container(index: string | null) {
    const el = document.createElement("div");
    if (index !== null) el.setAttribute("data-image-index", index);
    const img = document.createElement("img");
    el.appendChild(img);
    document.body.appendChild(el);
    return img;
  }

  it("déplace l'image vers le conteneur sous le doigt", async () => {
    const { result } = await loadHook();
    const onReorder = vi.fn();
    elementFromPoint.mockReturnValue(container("2"));
    act(() => result.current.handleTouchStart(0));
    act(() => result.current.handleTouchMove(touch(), onReorder, images, ids));
    expect(elementFromPoint).toHaveBeenCalledWith(5, 7);
    expect(onReorder).toHaveBeenCalledWith(["i1", "i2", "i0"], ["p1", "p2", "p0"]);
    expect(result.current.dragIndex).toBe(2);
  });

  it("ignore un mouvement sans toucher démarré", async () => {
    const { result } = await loadHook();
    act(() => result.current.handleTouchMove(touch(), vi.fn(), images, ids));
    expect(elementFromPoint).not.toHaveBeenCalled();
  });

  it.each([
    ["aucun élément sous le doigt", () => null],
    ["élément hors d'un conteneur", () => container(null)],
    ["même index", () => container("0")],
    ["index négatif", () => container("-1")],
    ["index au-delà de la liste", () => container("10")],
    ["index non numérique", () => container("abc")],
  ])("ne réordonne pas : %s", async (_label, target) => {
    const { result } = await loadHook();
    const onReorder = vi.fn();
    elementFromPoint.mockReturnValue(target());
    act(() => result.current.handleTouchStart(0));
    act(() => result.current.handleTouchMove(touch(), onReorder, images, ids));
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("réinitialise l'index à la fin du toucher", async () => {
    const { result } = await loadHook();
    act(() => result.current.handleTouchStart(1));
    expect(result.current.dragIndex).toBe(1);
    act(() => result.current.handleTouchEnd());
    expect(result.current.dragIndex).toBeNull();
    act(() => result.current.handleTouchMove(touch(), vi.fn(), images, ids));
    expect(elementFromPoint).not.toHaveBeenCalled();
  });
});
