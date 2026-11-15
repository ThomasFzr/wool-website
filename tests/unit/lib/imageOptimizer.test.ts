import { describe, expect, it } from "vitest";
import { cloudinaryOgImageUrl, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, optimizeCloudinaryUrl } from "@/lib/imageOptimizer";

const BASE = "https://res.cloudinary.com/demo/image/upload";

describe("optimizeCloudinaryUrl", () => {
  it("laisse intactes les URLs vides ou non Cloudinary", () => {
    expect(optimizeCloudinaryUrl("")).toBe("");
    expect(optimizeCloudinaryUrl("/images/logo.png")).toBe("/images/logo.png");
  });

  it("laisse intacte une URL Cloudinary sans unique segment /upload/", () => {
    const url = "https://res.cloudinary.com/demo/image/fetch/x.jpg";
    expect(optimizeCloudinaryUrl(url)).toBe(url);
    const twice = `${BASE}/a/upload/b.jpg`;
    expect(optimizeCloudinaryUrl(twice)).toBe(twice);
  });

  it("ajoute les transformations par défaut en préservant version et dossiers", () => {
    expect(optimizeCloudinaryUrl(`${BASE}/v1712345/creations/bonnet.jpg`)).toBe(
      `${BASE}/f_auto,q_75,w_600,c_limit/v1712345/creations/bonnet.jpg`
    );
  });

  it("remplace un bloc de transformations existant", () => {
    expect(
      optimizeCloudinaryUrl(`${BASE}/f_auto,q_50,w_200/v1/bonnet.jpg`, {
        width: 1200,
        quality: 90,
        format: "webp",
      })
    ).toBe(`${BASE}/f_webp,q_90,w_1200,c_limit/v1/bonnet.jpg`);
  });

  it("ne retire pas un nom de fichier seul qui ressemble à une transformation", () => {
    expect(optimizeCloudinaryUrl(`${BASE}/w_bonnet`)).toBe(`${BASE}/f_auto,q_75,w_600,c_limit/w_bonnet`);
  });
});

describe("cloudinaryOgImageUrl", () => {
  it("recadre une photo Cloudinary au format Open Graph annoncé, en JPEG", () => {
    expect(cloudinaryOgImageUrl(`${BASE}/f_auto,q_75,w_600/v1/creations/bonnet.jpg`)).toBe(
      `${BASE}/c_fill,g_auto,w_1200,h_630,f_jpg,q_80/v1/creations/bonnet.jpg`
    );
    expect(OG_IMAGE_WIDTH).toBe(1200);
    expect(OG_IMAGE_HEIGHT).toBe(630);
  });

  it("renvoie null hors Cloudinary ou pour une URL inattendue (dimensions inconnues)", () => {
    expect(cloudinaryOgImageUrl("")).toBeNull();
    expect(cloudinaryOgImageUrl("https://exemple.fr/photo.jpg")).toBeNull();
    expect(cloudinaryOgImageUrl("https://res.cloudinary.com/demo/image/fetch/x.jpg")).toBeNull();
  });
});
