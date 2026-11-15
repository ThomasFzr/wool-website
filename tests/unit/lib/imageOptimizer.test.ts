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
  const og = (layer: string) =>
    `c_fill,g_auto,w_1200,h_630/e_blur:2000/e_brightness:-15/l_${layer}/c_fit,w_1200,h_630/fl_layer_apply,g_center/f_jpg,q_80`;

  it("pose la photo entière sur son propre fond flouté, en 1200×630 JPEG", () => {
    expect(cloudinaryOgImageUrl(`${BASE}/v1773661469/ykr2etdnf3mjbd8i7dik.jpg`)).toBe(
      `${BASE}/${og("ykr2etdnf3mjbd8i7dik")}/v1773661469/ykr2etdnf3mjbd8i7dik.jpg`
    );
    expect(OG_IMAGE_WIDTH).toBe(1200);
    expect(OG_IMAGE_HEIGHT).toBe(630);
  });

  it("gère dossiers, absence de version et transformations existantes", () => {
    expect(cloudinaryOgImageUrl(`${BASE}/f_auto,q_75,w_600/v1/creations/hiver/bonnet.v2.png`)).toBe(
      `${BASE}/${og("creations:hiver:bonnet.v2")}/v1/creations/hiver/bonnet.v2.png`
    );
    expect(cloudinaryOgImageUrl(`${BASE}/creations/bonnet`)).toBe(`${BASE}/${og("creations:bonnet")}/creations/bonnet`);
  });

  it("renvoie null hors Cloudinary ou pour une URL inattendue", () => {
    expect(cloudinaryOgImageUrl("")).toBeNull();
    expect(cloudinaryOgImageUrl("https://exemple.fr/photo.jpg")).toBeNull();
    expect(cloudinaryOgImageUrl("https://res.cloudinary.com/demo/image/fetch/x.jpg")).toBeNull();
  });
});
