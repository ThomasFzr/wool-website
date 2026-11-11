import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "@/lib/sendEmail";
import { captureEmail, openInBrowser } from "@/lib/emailOutbox";

const resend = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return { emails: { send: resend.send } };
  }),
}));

// Seuls les effets de bord (disque, navigateur) sont simulés ; la décision capture/envoi reste réelle
vi.mock("@/lib/emailOutbox", async (orig) => ({
  ...(await orig<object>()),
  captureEmail: vi.fn(),
  openInBrowser: vi.fn(),
}));

const email = { to: "client@example.com", subject: "Commande confirmée", html: "<p>Merci</p>" };

describe("sendEmail", () => {
  beforeEach(() => {
    vi.stubEnv("EMAIL_FROM", "MailleMum <noreply@maillemum.fr>");
    vi.mocked(captureEmail).mockImplementation(async (e) => ({ ...e, id: "abc123", sentAt: "2026-01-01" }));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("exige EMAIL_FROM", async () => {
    vi.stubEnv("EMAIL_FROM", "");
    await expect(sendEmail(email)).rejects.toThrow(/EMAIL_FROM/);
    expect(captureEmail).not.toHaveBeenCalled();
    expect(resend.send).not.toHaveBeenCalled();
  });

  describe("en mode aperçu local", () => {
    beforeEach(() => {
      vi.stubEnv("EMAIL_TRANSPORT", "preview");
    });

    it("capture l'email sans l'envoyer et ouvre l'aperçu sur le serveur local", async () => {
      vi.stubEnv("EMAIL_PREVIEW_OPEN", "1");
      vi.stubEnv("NEXTAUTH_URL", "http://localhost:4000");
      expect(await sendEmail(email)).toEqual({ data: { id: "preview-abc123" }, error: null });
      expect(captureEmail).toHaveBeenCalledWith(email);
      expect(openInBrowser).toHaveBeenCalledWith("http://localhost:4000/dev/emails?id=abc123");
      expect(resend.send).not.toHaveBeenCalled();
    });

    it("n'ouvre pas le navigateur avec EMAIL_PREVIEW_OPEN=0 et vise localhost:3000 par défaut", async () => {
      vi.stubEnv("EMAIL_PREVIEW_OPEN", "0");
      vi.stubEnv("NEXTAUTH_URL", "");
      await sendEmail(email);
      expect(openInBrowser).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining("http://localhost:3000/dev/emails?id=abc123"));
    });

    it("propage un échec de capture", async () => {
      vi.mocked(captureEmail).mockRejectedValue(new Error("disque plein"));
      await expect(sendEmail(email)).rejects.toThrow("disque plein");
      expect(resend.send).not.toHaveBeenCalled();
    });
  });

  describe("en envoi réel via Resend", () => {
    beforeEach(() => {
      vi.stubEnv("EMAIL_TRANSPORT", "resend");
    });

    it("envoie l'email et renvoie la réponse de Resend", async () => {
      resend.send.mockResolvedValue({ data: { id: "re_1" }, error: null });
      expect(await sendEmail(email)).toEqual({ data: { id: "re_1" }, error: null });
      expect(resend.send).toHaveBeenCalledWith({ from: "MailleMum <noreply@maillemum.fr>", ...email });
      expect(captureEmail).not.toHaveBeenCalled();
    });

    it("transforme une erreur renvoyée par Resend en exception", async () => {
      resend.send.mockResolvedValue({ data: null, error: { message: "domaine non vérifié" } });
      await expect(sendEmail(email)).rejects.toThrow(
        'Échec d\'envoi de l\'email "Commande confirmée" : domaine non vérifié'
      );
    });

    it("propage une exception réseau", async () => {
      resend.send.mockRejectedValue(new Error("ECONNRESET"));
      await expect(sendEmail(email)).rejects.toThrow("ECONNRESET");
      expect(console.error).toHaveBeenCalledWith("[sendEmail] ERROR", expect.objectContaining({ err: "ECONNRESET" }));
    });

    it("journalise une valeur rejetée qui n'est pas une Error", async () => {
      resend.send.mockRejectedValue("refus brut");
      await expect(sendEmail(email)).rejects.toBe("refus brut");
      expect(console.error).toHaveBeenCalledWith("[sendEmail] ERROR", expect.objectContaining({ err: "refus brut" }));
    });
  });
});
