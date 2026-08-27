import { useState, ChangeEvent } from "react";

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export function useImageUpload() {
  const [uploading, setUploading] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [touchStartIndex, setTouchStartIndex] = useState<number | null>(null);

  async function handleImageChange(
    e: ChangeEvent<HTMLInputElement>,
    onUploadComplete: (urls: string[], publicIds: string[]) => void
  ) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!CLOUD_NAME || !UPLOAD_PRESET) {
      throw new Error("Cloudinary n'est pas configuré.");
    }

    try {
      setUploading(true);

      // Uploads en parallèle (l'ordre de sélection est préservé par le map)
      const results = await Promise.all(
        Array.from(files).map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("upload_preset", UPLOAD_PRESET);

          const res = await fetch(
            `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
            { method: "POST", body: formData }
          );

          if (!res.ok) throw new Error("Erreur Cloudinary");

          const data = await res.json();
          return { url: data.secure_url as string, publicId: data.public_id as string };
        })
      );

      const uploadedUrls = results.map((r) => r.url);
      const uploadedPublicIds = results.map((r) => r.publicId);

      // Réinitialiser l'input pour permettre de sélectionner les mêmes fichiers
      e.target.value = '';
      
      onUploadComplete(uploadedUrls, uploadedPublicIds);
    } catch (err) {
      console.error(err);
      throw new Error("Erreur lors de l'upload des images.");
    } finally {
      setUploading(false);
    }
  }

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, index: number, onReorder: (newImages: string[], newPublicIds: string[]) => void, images: string[], publicIds: string[]) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;

    const imagesArr = [...images];
    const publicIdsArr = [...publicIds];
    const [movedImage] = imagesArr.splice(dragIndex, 1);
    const [movedPublicId] = publicIdsArr.splice(dragIndex, 1);
    imagesArr.splice(index, 0, movedImage);
    publicIdsArr.splice(index, 0, movedPublicId);
    
    onReorder(imagesArr, publicIdsArr);
    setDragIndex(index);
  }

  function handleDragEnd() {
    setDragIndex(null);
  }

  function handleTouchStart(index: number) {
    setTouchStartIndex(index);
    setDragIndex(index);
  }

  function handleTouchMove(
    e: React.TouchEvent<HTMLDivElement>,
    onReorder: (newImages: string[], newPublicIds: string[]) => void,
    images: string[],
    publicIds: string[]
  ) {
    if (touchStartIndex === null) return;
    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!element) return;

    const imageContainer = element.closest("[data-image-index]");
    if (!imageContainer) return;

    const targetIndex = Number(imageContainer.getAttribute("data-image-index"));

    if (targetIndex !== touchStartIndex && targetIndex >= 0) {
      const imagesArr = [...images];
      const publicIdsArr = [...publicIds];
      const [movedImage] = imagesArr.splice(touchStartIndex, 1);
      const [movedPublicId] = publicIdsArr.splice(touchStartIndex, 1);
      imagesArr.splice(targetIndex, 0, movedImage);
      publicIdsArr.splice(targetIndex, 0, movedPublicId);
      
      onReorder(imagesArr, publicIdsArr);
      setTouchStartIndex(targetIndex);
      setDragIndex(targetIndex);
    }
  }

  function handleTouchEnd() {
    setTouchStartIndex(null);
    setDragIndex(null);
  }

  return {
    uploading,
    dragIndex,
    handleImageChange,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}

