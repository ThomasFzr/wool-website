import { describe, expect, it, vi } from "vitest";
import { v2 as cloudinarySdk } from "cloudinary";
import { POST } from "@/app/api/admin/cloudinary-signature/route";
import { readJson } from "../../../../helpers/http";
import { asAdmin } from "../../../../helpers/session";
import { expectAdminOnly } from "../../../../helpers/admin-fixtures";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));

function configure(config: { cloud_name?: string; api_key?: string; api_secret?: string }) {
  vi.spyOn(cloudinarySdk, "config").mockReturnValue(config as ReturnType<typeof cloudinarySdk.config>);
}

describe("POST /api/admin/cloudinary-signature", () => {
  it("est réservé aux admins", async () => {
    await expectAdminOnly(() => POST());
  });

  it("signe le timestamp avec le secret de l'API, sans exposer le secret", async () => {
    configure({ cloud_name: "demo", api_key: "key-1", api_secret: "secret-1" });
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_400);
    asAdmin();

    const { status, body } = await readJson(await POST());
    expect(status).toBe(200);
    expect(body).toEqual({
      cloudName: "demo",
      apiKey: "key-1",
      timestamp: 1_700_000_000,
      signature: cloudinarySdk.utils.api_sign_request({ timestamp: 1_700_000_000 }, "secret-1"),
    });
    expect(JSON.stringify(body)).not.toContain("secret-1");
  });

  it("signe aussi le preset défini côté serveur", async () => {
    configure({ cloud_name: "demo", api_key: "key-1", api_secret: "secret-1" });
    vi.stubEnv("CLOUDINARY_UPLOAD_PRESET", "signed-preset");
    asAdmin();

    const { body } = await readJson(await POST());
    expect(body.upload_preset).toBe("signed-preset");
    expect(body.signature).toBe(
      cloudinarySdk.utils.api_sign_request({ timestamp: body.timestamp, upload_preset: "signed-preset" }, "secret-1")
    );
  });

  it.each([
    ["sans cloud name", { api_key: "k", api_secret: "s" }],
    ["sans clé", { cloud_name: "demo", api_secret: "s" }],
    ["sans secret", { cloud_name: "demo", api_key: "k" }],
  ])("répond 500 si Cloudinary n'est pas configuré (%s)", async (_label, config) => {
    configure(config);
    asAdmin();
    const { status, body } = await readJson(await POST());
    expect(status).toBe(500);
    expect(body.error).toBe("Cloudinary n'est pas configuré.");
  });
});
