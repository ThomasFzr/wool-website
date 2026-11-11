import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/forgot-password/route";
import { connectToDatabase } from "@/lib/db";
import { sendEmail } from "@/lib/sendEmail";
import User from "@/models/User";
import { makeRequest, readJson } from "../../../helpers/http";

vi.mock("@/lib/sendEmail", () => ({ sendEmail: vi.fn() }));

const NEUTRAL = { message: "Si ce compte existe, un email a été envoyé" };
const post = (body: unknown, headers?: Record<string, string>) =>
  POST(makeRequest("/api/auth/forgot-password", { method: "POST", body, headers }));

// Le rate limit est en base (vidée entre les tests) : une adresse distincte par test reste plus lisible.
let n = 0;
const uniqueEmail = () => `client${++n}@example.com`;

const withSecret = (email: string) =>
  User.findOne({ email }).select("+resetToken +resetTokenExpiry");

describe("POST /api/auth/forgot-password", () => {
  beforeEach(async () => {
    await connectToDatabase();
  });

  it("exige un email sous forme de chaîne", async () => {
    for (const body of [{}, { email: "" }, { email: 42 }]) {
      const { status, body: res } = await readJson(await post(body));
      expect(status).toBe(400);
      expect(res.error).toBe("Email requis");
    }
  });

  it("répond neutre sans email pour un compte inconnu", async () => {
    const { status, body } = await readJson(await post({ email: uniqueEmail() }));
    expect(status).toBe(200);
    expect(body).toEqual(NEUTRAL);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("répond neutre sans email pour un compte Google", async () => {
    const email = uniqueEmail();
    await User.create({ email, provider: "google" });
    const { status, body } = await readJson(await post({ email }));
    expect(status).toBe(200);
    expect(body).toEqual(NEUTRAL);
    expect(sendEmail).not.toHaveBeenCalled();
    expect((await withSecret(email))!.resetToken).toBeUndefined();
  });

  it("stocke le hash du token et envoie le lien en clair par email", async () => {
    const email = uniqueEmail();
    await User.create({ email, provider: "credentials" });
    const before = Date.now();

    const { status, body } = await readJson(await post({ email: `  ${email.toUpperCase()} ` }));
    expect(status).toBe(200);
    expect(body).toEqual(NEUTRAL);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail.to).toBe(email);
    expect(mail.subject).toBe("Réinitialisation de votre mot de passe");
    const token = mail.html.match(/http:\/\/localhost:3000\/reset-password\?token=([a-f0-9]{64})/)![1];

    const user = await withSecret(email);
    expect(user!.resetToken).toBe(crypto.createHash("sha256").update(token).digest("hex"));
    expect(user!.resetToken).not.toBe(token);
    const expiry = user!.resetTokenExpiry!.getTime();
    expect(expiry).toBeGreaterThanOrEqual(before + 3600000 - 1000);
    expect(expiry).toBeLessThanOrEqual(Date.now() + 3600000);
  });

  it("ignore un en-tête Host non autorisé dans le lien envoyé", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://boutique.example.com");
    const email = uniqueEmail();
    await User.create({ email, provider: "credentials" });
    await post({ email }, { host: "evil.example.net" });
    expect(vi.mocked(sendEmail).mock.calls[0][0].html).toContain("https://boutique.example.com/reset-password?token=");
  });

  it("limite à une demande par minute et par adresse, puis réautorise", async () => {
    const email = uniqueEmail();
    await User.create({ email, provider: "credentials" });
    // Début d'une fenêtre d'une minute (les fenêtres sont alignées sur l'horloge)
    const now = 30_000_000 * 60_000 + 1_000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);

    await post({ email });
    expect(sendEmail).toHaveBeenCalledTimes(1);

    clock.mockReturnValue(now + 30_000);
    const { status, body } = await readJson(await post({ email }));
    expect(status).toBe(200);
    expect(body).toEqual(NEUTRAL);
    expect(sendEmail).toHaveBeenCalledTimes(1);

    // Fenêtre suivante : une nouvelle demande part
    clock.mockReturnValue(now + 61_000);
    await post({ email });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("limite les demandes par IP, toutes adresses confondues, sans le révéler", async () => {
    const emails = Array.from({ length: 6 }, uniqueEmail);
    await User.create(emails.map((email) => ({ email, provider: "credentials" })));
    const ip = { "x-real-ip": "203.0.113.7" };

    for (const email of emails.slice(0, 5)) await post({ email }, ip);
    expect(sendEmail).toHaveBeenCalledTimes(5);

    const { status, body } = await readJson(await post({ email: emails[5] }, ip));
    expect(status).toBe(200);
    expect(body).toEqual(NEUTRAL);
    expect(sendEmail).toHaveBeenCalledTimes(5);

    // Une autre IP n'est pas concernée
    await post({ email: emails[5] }, { "x-real-ip": "198.51.100.1" });
    expect(sendEmail).toHaveBeenCalledTimes(6);
  });

  it("garde la réponse neutre si l'envoi de l'email échoue (pas d'énumération)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("resend down"));
    const email = uniqueEmail();
    await User.create({ email, provider: "credentials" });
    const { status, body } = await readJson(await post({ email }));
    expect(status).toBe(200);
    expect(body).toEqual(NEUTRAL);
    expect(spy).toHaveBeenCalledWith("[forgot-password] Envoi de l'email impossible:", expect.any(Error));
  });

  it("répond 500 sur un corps JSON invalide", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post("{pas du json")).status).toBe(500);
  });
});
