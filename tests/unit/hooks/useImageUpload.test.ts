// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, act, renderHook } from "@testing-library/react";
import type React from "react";
import type { ChangeEvent } from "react";

// Les variables Cloudinary sont lues au chargement du module : on le recharge par test
async function loadHook(env: { cloud?: string; preset?: string } = { cloud: "demo", preset: "preset" }) {
  vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", env.cloud ?? "");
  vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET", env.preset ?? "");
  vi.resetModules();
  const { useImageUpload } = await import("@/hooks/useImageUpload");
  return renderHook(() => useImageUpload());
}

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
  it("envoie chaque fichier à Cloudinary et renvoie urls et publicIds dans l'ordre", async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const name = ((init.body as FormData).get("file") as File).name;
      return { ok: true, json: async () => ({ secure_url: `https://cdn/${name}`, public_id: `id-${name}` }) };
    });
    const { result } = await loadHook();
    const onDone = vi.fn();
    const e = changeEvent([file("1.jpg"), file("2.jpg")]);

    await act(() => result.current.handleImageChange(e, onDone));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("upload_preset")).toBe("preset");
    expect(onDone).toHaveBeenCalledWith(["https://cdn/1.jpg", "https://cdn/2.jpg"], ["id-1.jpg", "id-2.jpg"]);
    expect(e.target.value).toBe("");
    expect(result.current.uploading).toBe(false);
  });

  it("indique l'envoi en cours pendant l'upload", async () => {
    let finish!: () => void;
    fetchMock.mockReturnValue(
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

  it.each([
    ["sans cloud name", { preset: "preset" }],
    ["sans upload preset", { cloud: "demo" }],
  ])("refuse l'envoi si Cloudinary n'est pas configuré (%s)", async (_label, env) => {
    const { result } = await loadHook(env);
    await expect(result.current.handleImageChange(changeEvent([file("1.jpg")]), vi.fn())).rejects.toThrow(
      "Cloudinary n'est pas configuré."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lève une erreur générique si Cloudinary refuse un fichier, sans appeler le callback", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
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
  ])("ne réordonne pas : %s", async (_label, target) => {
    const { result } = await loadHook();
    const onReorder = vi.fn();
    elementFromPoint.mockReturnValue(target());
    act(() => result.current.handleTouchStart(0));
    act(() => result.current.handleTouchMove(touch(), onReorder, images, ids));
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("accepte un index au-delà de la liste (pas de borne supérieure)", async () => {
    // BUG: contrairement à useDragAndDrop, aucun contrôle targetIndex < images.length :
    // un data-image-index hors liste déplace l'image en dernière position.
    const { result } = await loadHook();
    const onReorder = vi.fn();
    elementFromPoint.mockReturnValue(container("10"));
    act(() => result.current.handleTouchStart(0));
    act(() => result.current.handleTouchMove(touch(), onReorder, images, ids));
    expect(onReorder).toHaveBeenCalledWith(["i1", "i2", "i0"], ["p1", "p2", "p0"]);
    expect(result.current.dragIndex).toBe(10);
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
