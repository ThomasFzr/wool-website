// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, act, renderHook } from "@testing-library/react";
import type React from "react";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";

const items = ["a", "b", "c", "d"];

function dragEvent() {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: { dropEffect: "none" },
  } as unknown as React.DragEvent<HTMLDivElement> & { dataTransfer: { dropEffect: string } };
}

function touchEvent(clientY: number | null, clientX = 10) {
  return {
    preventDefault: vi.fn(),
    touches: clientY === null ? [] : [{ clientX, clientY }],
  } as unknown as React.TouchEvent<HTMLDivElement>;
}

/** Crée une carte avec un attribut data-creation-index (null = sans attribut) */
function card(index: string | null) {
  const el = document.createElement("div");
  if (index !== null) el.setAttribute("data-creation-index", index);
  const child = document.createElement("span");
  el.appendChild(child);
  document.body.appendChild(el);
  return child;
}

const elementFromPoint = vi.fn();

beforeEach(() => {
  document.elementFromPoint = elementFromPoint;
  elementFromPoint.mockReset();
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function setup() {
  const onReorder = vi.fn();
  const hook = renderHook(() => useDragAndDrop(items, onReorder));
  return { ...hook, onReorder };
}

describe("useDragAndDrop — souris", () => {
  it("déplace l'élément glissé vers la position survolée", () => {
    const { result, onReorder } = setup();
    act(() => result.current.handleDragStart(0));
    expect(result.current.dragIndex).toBe(0);

    const e = dragEvent();
    act(() => result.current.handleDragOver(e, 2));

    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
    expect(e.dataTransfer.dropEffect).toBe("move");
    expect(onReorder).toHaveBeenCalledWith(["b", "c", "a", "d"]);
    expect(result.current.dragIndex).toBe(2);
  });

  it("ne fait rien sans glissement en cours", () => {
    const { result, onReorder } = setup();
    const e = dragEvent();
    act(() => result.current.handleDragOver(e, 1));
    expect(e.preventDefault).toHaveBeenCalled();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("ne fait rien en survolant sa propre position", () => {
    const { result, onReorder } = setup();
    act(() => result.current.handleDragStart(1));
    act(() => result.current.handleDragOver(dragEvent(), 1));
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("réinitialise l'index à la fin du glissement", () => {
    const { result } = setup();
    act(() => result.current.handleDragStart(1));
    act(() => result.current.handleDragEnd());
    expect(result.current.dragIndex).toBeNull();
  });
});

describe("useDragAndDrop — tactile", () => {
  it("ignore un mouvement sans toucher démarré", () => {
    const { result, onReorder } = setup();
    act(() => result.current.handleTouchMove(touchEvent(100)));
    expect(elementFromPoint).not.toHaveBeenCalled();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("ignore un événement sans point de contact", () => {
    const { result } = setup();
    act(() => result.current.handleTouchStart(0));
    act(() => result.current.handleTouchMove(touchEvent(null)));
    expect(elementFromPoint).not.toHaveBeenCalled();
  });

  it("enregistre la position de départ au premier mouvement puis ignore les petits mouvements", () => {
    const { result } = setup();
    act(() => result.current.handleTouchStart(0));
    const first = touchEvent(100);
    act(() => result.current.handleTouchMove(first));
    expect(first.preventDefault).not.toHaveBeenCalled();

    const small = touchEvent(105);
    act(() => result.current.handleTouchMove(small));
    expect(small.preventDefault).not.toHaveBeenCalled();
    expect(elementFromPoint).not.toHaveBeenCalled();
  });

  function startAndMove(result: { current: ReturnType<typeof useDragAndDrop<string>> }, from = 0) {
    act(() => result.current.handleTouchStart(from));
    act(() => result.current.handleTouchMove(touchEvent(100)));
    const e = touchEvent(200, 15);
    act(() => result.current.handleTouchMove(e));
    return e;
  }

  it("déplace l'élément vers la carte sous le doigt et empêche le défilement", () => {
    const { result, onReorder } = setup();
    elementFromPoint.mockReturnValue(card("3"));
    const e = startAndMove(result, 0);

    expect(e.preventDefault).toHaveBeenCalled();
    expect(elementFromPoint).toHaveBeenCalledWith(15, 200);
    expect(onReorder).toHaveBeenCalledWith(["b", "c", "d", "a"]);
    expect(result.current.dragIndex).toBe(3);
  });

  it.each([
    ["aucun élément sous le doigt", () => null],
    ["élément hors d'une carte", () => card(null)],
    ["attribut vide", () => card("")],
    ["index non numérique", () => card("abc")],
    ["même index que le départ", () => card("0")],
    ["index négatif", () => card("-1")],
    ["index hors liste", () => card("4")],
  ])("ne réordonne pas : %s", (_label, target) => {
    const { result, onReorder } = setup();
    elementFromPoint.mockReturnValue(target());
    startAndMove(result, 0);
    expect(onReorder).not.toHaveBeenCalled();
    expect(result.current.dragIndex).toBe(0);
  });

  it("réinitialise tout à la fin du toucher, y compris la position de départ", () => {
    const { result } = setup();
    elementFromPoint.mockReturnValue(card("2"));
    act(() => result.current.handleTouchStart(0));
    act(() => result.current.handleTouchMove(touchEvent(100)));
    act(() => result.current.handleTouchEnd());
    expect(result.current.dragIndex).toBeNull();

    // Nouveau toucher : le premier mouvement ré-enregistre la position de départ
    act(() => result.current.handleTouchStart(1));
    act(() => result.current.handleTouchMove(touchEvent(300)));
    expect(elementFromPoint).not.toHaveBeenCalled();
  });
});
