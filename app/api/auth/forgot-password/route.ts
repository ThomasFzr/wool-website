// app/api/auth/forgot-password/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { sendEmail } from "@/lib/sendEmail";
import { emailTemplate } from "@/lib/emailTemplate";
import { getEmailBaseUrl } from "@/lib/url";
import { clientIp, hitRateLimit } from "@/lib/rate-limit";
import crypto from "crypto";

// Un email de réinitialisation par adresse et par minute, et un nombre de demandes borné
// par IP (sinon une seule machine peut faire envoyer des emails à des milliers d'adresses).
const EMAIL_WINDOW_MS = 60_000;
const IP_MAX_REQUESTS = 5;
const IP_WINDOW_MS = 15 * 60_000;

// Réponse unique quelle que soit l'issue : ne révèle ni l'existence du compte,
// ni son provider (anti énumération de comptes).
const neutralResponse = () =>
  NextResponse.json(
    { message: "Si ce compte existe, un email a été envoyé" },
    { status: 200 }
  );

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email requis" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    await connectToDatabase();

    // Toujours la réponse neutre : un 429 révélerait qu'une demande vient d'être faite
    const ipCount = await hitRateLimit(`forgot:ip:${clientIp(req.headers)}`, IP_WINDOW_MS);
    if (ipCount > IP_MAX_REQUESTS) return neutralResponse();
    if ((await hitRateLimit(`forgot:email:${normalizedEmail}`, EMAIL_WINDOW_MS)) > 1) {
      return neutralResponse();
    }

    const user = await User.findOne({ email: normalizedEmail });

    if (!user || user.provider !== "credentials") {
      return neutralResponse();
    }

    // Générer un token de réinitialisation ; seul son hash est stocké en base
    // (un accès en lecture à la DB ne permet pas de prendre le contrôle des comptes)
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 heure

    user.resetToken = hashedToken;
    user.resetTokenExpiry = resetTokenExpiry;
    await user.save();

    // Créer le lien de réinitialisation (le token en clair ne part que dans l'email)
    const resetUrl = `${getEmailBaseUrl(req.headers)}/reset-password?token=${resetToken}`;

    // Envoyer l'email. Un échec n'est que journalisé : une erreur ici, et pas pour une
    // adresse inconnue, révélerait l'existence du compte.
    try {
      await sendEmail({
        to: user.email,
        subject: "Réinitialisation de votre mot de passe",
        html: emailTemplate(`
          <h2 style="font-size:18px;margin:0 0 12px 0;">Réinitialisation de mot de passe</h2>
          <p style="font-size:14px;margin:0 0 12px 0;">Vous avez demandé à réinitialiser votre mot de passe.</p>
          <p style="font-size:14px;margin:0 0 16px 0;">Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background-color:#0f172a;color:white;text-decoration:none;border-radius:8px;font-weight:600;">
              Réinitialiser mon mot de passe
            </a>
          </p>
          <p style="font-size:13px;margin:16px 0 8px 0;color:#6b7280;">Ce lien expirera dans 1 heure.</p>
          <p style="font-size:13px;margin:0;color:#6b7280;">Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
        `),
      });
    } catch (error) {
      console.error("[forgot-password] Envoi de l'email impossible:", error);
    }

    return neutralResponse();
  } catch (error) {
    console.error("[forgot-password] Error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi de l'email" },
      { status: 500 }
    );
  }
}
