import { Resend } from "resend";
import {
  captureEmail,
  isEmailAutoOpenEnabled,
  isEmailPreviewEnabled,
  openInBrowser,
} from "@/lib/emailOutbox";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error("EMAIL_FROM n'est pas définie dans les variables d'environnement");
  }

  // En local : capture au lieu d'un envoi réel (préserve le quota Resend).
  // Le rendu est consultable sur /dev/emails.
  if (isEmailPreviewEnabled()) {
    try {
      const captured = await captureEmail({ to, subject, html });
      // La capture n'existe qu'en local : le lien d'aperçu doit viser le serveur
      // de dev, pas NEXT_PUBLIC_APP_URL (qui pointe sur la production).
      const localUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      const previewUrl = `${localUrl}/dev/emails?id=${captured.id}`;
      console.log(
        `[sendEmail] CAPTURÉ (aucun envoi réel) → ${previewUrl}\n` +
          `            to: ${to} | subject: ${subject}`
      );

      // Ouvre l'aperçu directement dans le navigateur (EMAIL_PREVIEW_OPEN=0 pour couper)
      if (isEmailAutoOpenEnabled()) {
        openInBrowser(previewUrl);
      }

      return { data: { id: `preview-${captured.id}` }, error: null };
    } catch (err: any) {
      // Une capture impossible ne doit pas masquer un problème d'envoi :
      // on le signale explicitement plutôt que de faire semblant.
      console.error("[sendEmail] Échec de la capture locale de l'email", err);
      throw err;
    }
  }

  try {
    const result = await resend.emails.send({
      from,
      to,
      subject,
      html,
    });

    if (result.error) {
      console.error("[sendEmail] RESEND ERROR", result.error);
      throw new Error(`Échec d'envoi de l'email "${subject}" : ${result.error.message}`);
    }

    return result;
  } catch (err: any) {
    console.error("[sendEmail] ERROR", {
      to,
      subject,
      err: err?.message || err,
    });
    throw err;
  }
}
