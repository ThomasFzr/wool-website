import { useState, useRef } from "react";

export function useDragAndDrop<T>(items: T[], onReorder: (newItems: T[]) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [touchStartIndex, setTouchStartIndex] = useState<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchThreshold = 10; // Seuil minimum de mouvement pour activer le drag

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, index: number) {
    e.preventDefault();
    e.stopPropagation();
    if (dragIndex === null || dragIndex === index) return;

    e.dataTransfer.dropEffect = "move";

    const newList = [...items];
    const [movedItem] = newList.splice(dragIndex, 1);
    newList.splice(index, 0, movedItem);
    onReorder(newList);

    setDragIndex(index);
  }

  function handleDragEnd() {
    setDragIndex(null);
  }

  function handleTouchStart(index: number) {
    setTouchStartIndex(index);
    setDragIndex(index);
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (touchStartIndex === null) return;
    
    const touch = e.touches[0];
    if (!touch) return;
    
    // Enregistrer la position de départ si ce n'est pas déjà fait
    if (touchStartY.current === null) {
      touchStartY.current = touch.clientY;
      return;
    }

    // Vérifier si le mouvement est suffisant pour activer le drag
    const deltaY = Math.abs(touch.clientY - touchStartY.current);
    if (deltaY < touchThreshold) return;

    // Empêcher le scroll pendant le drag
    e.preventDefault();

    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!element) return;

    const itemCard = element.closest("[data-creation-index]");
    if (!itemCard) return;

    const targetIndexAttr = itemCard.getAttribute("data-creation-index");
    if (!targetIndexAttr) return;

    const targetIndex = Number(targetIndexAttr);

    if (!isNaN(targetIndex) && targetIndex !== touchStartIndex && targetIndex >= 0 && targetIndex < items.length) {
      const newList = [...items];
      const [movedItem] = newList.splice(touchStartIndex, 1);
      newList.splice(targetIndex, 0, movedItem);
      onReorder(newList);

      setTouchStartIndex(targetIndex);
      setDragIndex(targetIndex);
    }
  }

  function handleTouchEnd() {
    setTouchStartIndex(null);
    setDragIndex(null);
    touchStartY.current = null;
  }

  return {
    dragIndex,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}

