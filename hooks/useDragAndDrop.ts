import { useState } from "react";

export function useDragAndDrop<T>(items: T[], onReorder: (newItems: T[]) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [touchStartIndex, setTouchStartIndex] = useState<number | null>(null);

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, index: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;

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
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!element) return;

    const itemCard = element.closest("[data-creation-index]");
    if (!itemCard) return;

    const targetIndex = Number(itemCard.getAttribute("data-creation-index"));

    if (targetIndex !== touchStartIndex && targetIndex >= 0) {
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

