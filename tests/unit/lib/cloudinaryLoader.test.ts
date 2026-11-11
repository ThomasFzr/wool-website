import { describe, expect, it } from "vitest";
// @ts-expect-error -- module JavaScript sans déclaration de types
import cloudinaryLoader from "@/lib/cloudinaryLoader";

describe("cloudinaryLoader", () => {
  it("renvoie telle quelle une image non Cloudinary", () => {
    expect(cloudinaryLoader({ src: "/images/logo.png", width: 300 })).toBe("/images/logo.png");
  });

  it("injecte largeur, qualité par défaut et format automatique", () => {
    expect(
      cloudinaryLoader({ src: "https://res.cloudinary.com/demo/image/upload/v1/a.jpg", width: 300 })
    ).toBe("https://res.cloudinary.com/demo/image/upload/w_300,q_75,f_auto,c_limit/v1/a.jpg");
  });

  it("respecte la qualité demandée", () => {
    expect(
      cloudinaryLoader({ src: "https://res.cloudinary.com/demo/image/upload/a.jpg", width: 64, quality: 40 })
    ).toBe("https://res.cloudinary.com/demo/image/upload/w_64,q_40,f_auto,c_limit/a.jpg");
  });
});
