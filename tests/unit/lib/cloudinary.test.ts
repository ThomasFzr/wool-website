import { describe, expect, it, vi } from "vitest";

describe("cloudinary", () => {
  it("configure le SDK depuis les variables d'environnement", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "demo-cloud");
    vi.stubEnv("CLOUDINARY_API_KEY", "key-123");
    vi.stubEnv("CLOUDINARY_API_SECRET", "secret-456");
    const { cloudinary } = await import("@/lib/cloudinary");
    expect(cloudinary.config()).toMatchObject({
      cloud_name: "demo-cloud",
      api_key: "key-123",
      api_secret: "secret-456",
    });
  });
});
