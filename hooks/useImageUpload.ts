import { useState, ChangeEvent } from "react";

type UploadSignature = {
  cloudName: string;
  apiKey: string;
  signature: string;
  timestamp: number;
  upload_preset?: string;
};

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

    try {
      setUploading(true);

      // Envoi signé par le serveur (réservé à l'admin) : Cloudinary refuse les envois anonymes
      const signRes = await fetch("/api/admin/cloudinary-signature", { method: "POST" });
      if (!signRes.ok) throw new Error("Signature Cloudinary refusée");
      const { cloudName, apiKey, signature, timestamp, upload_preset } =
        (await signRes.json()) as UploadSignature;

      // Uploads en parallèle (l'ordre de sélection est préservé par le map)
      const results = await Promise.all(
        Array.from(files).map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("api_key", apiKey);
          formData.append("timestamp", String(timestamp));
          formData.append("signature", signature);
          if (upload_preset) formData.append("upload_preset", upload_preset);

          const res = await fetch(
            `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
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

    // Index lu dans le DOM : borné à la liste (comme useDragAndDrop)
    if (Number.isInteger(targetIndex) && targetIndex !== touchStartIndex && targetIndex >= 0 && targetIndex < images.length) {
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

