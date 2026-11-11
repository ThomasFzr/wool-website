import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import Contact from "@/models/Contact";
import Creation from "@/models/Creation";
import { sendEmail } from "@/lib/sendEmail";
import { emailTemplate } from "@/lib/emailTemplate";
import { escapeHtml } from "@/lib/escape";
import { clientIp, hitRateLimit } from "@/lib/rate-limit";
import mongoose from "mongoose";

// Messages par IP (stockage partagé, cf. lib/rate-limit.ts)
const CONTACT_MAX_PER_IP = 5;
const CONTACT_WINDOW_MS = 10 * 60_000;
const MAX_CREATIONS = 20;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Frontières de mot Unicode : \b ne connaît que [A-Za-z0-9_], si bien que « con » était
// trouvé dans « conçu » (le ç n'étant pas une lettre pour \b).
const words = (alternatives: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])(${alternatives})(?![\\p{L}\\p{N}])`, "iu");

// Détection de spam
function containsSpam(text: string): boolean {
  const spamPatterns = [
    words("viagra|cialis|casino|lottery|winner|cryptocurrency|bitcoin"),
    /https?:\/\/[^\s]+\.(ru|cn|tk)/i, // Domaines suspects
    /<a\s+href=/i, // Liens HTML
  ];
  return spamPatterns.some(pattern => pattern.test(text));
}

// Détection d'insultes et langage offensant
function containsOffensiveContent(text: string): boolean {
  const offensiveWords = [
    // Insultes courantes en français (« con » seul exclu : trop de faux positifs)
    words("connard|connasse|salope|putain|pute|merde|chier|enculé|enculer|fdp|conne|bite|couille|pd|pédé"),
    words("ta gueule|ferme ta|nique|niker|niquer|enc[uû]l|baiser|bâtard|batard|crevard|débile|abruti"),
    words("idiot|imbécile|crétin|taré|mongol|attardé|salaud|ordure|mec de merde|fils de pute|enfoiré"),
    // Insultes en anglais
    words("fuck|fucking|shit|bitch|asshole|bastard|cunt|dick|pussy"),
    // Variantes avec caractères spéciaux
    /c[o0@]nn[a4@]rd/i,
    /p[uù]t[a4@][1il]n/i,
    /m[e3]rd[e3]/i,
  ];
  return offensiveWords.some(pattern => pattern.test(text));
}

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    await connectToDatabase();

    const body = await req.json();
    const { name, email, subject, message, creationId, creationIds, website } = body ?? {};

    // Validation de base
    if (![name, email, subject, message].every(isNonEmptyString)) {
      return NextResponse.json(
        { error: "Tous les champs sont requis." },
        { status: 400 }
      );
    }

    // Validation longueur
    if (name.length > 100 || email.length > 100 || subject.length > 200 || message.length > 2000) {
      return NextResponse.json(
        { error: "Un ou plusieurs champs dépassent la longueur maximale autorisée." },
        { status: 400 }
      );
    }

    if (!EMAIL_REGEX.test(email.trim())) {
      return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 });
    }

    // Créations concernées : identifiants valides, en nombre borné
    const isId = (id: unknown) => typeof id === "string" && mongoose.isObjectIdOrHexString(id);
    if (
      (creationId != null && creationId !== "" && !isId(creationId)) ||
      (creationIds != null &&
        (!Array.isArray(creationIds) || creationIds.length > MAX_CREATIONS || !creationIds.every(isId)))
    ) {
      return NextResponse.json({ error: "Création invalide." }, { status: 400 });
    }
    let finalCreationIds: string[] = [];
    if (Array.isArray(creationIds) && creationIds.length > 0) {
      finalCreationIds = [...new Set<string>(creationIds)];
    } else if (creationId) {
      finalCreationIds = [creationId];
    }

    // Rate limiting par IP, partagé entre instances
    if ((await hitRateLimit(`contact:ip:${clientIp(req.headers)}`, CONTACT_WINDOW_MS)) > CONTACT_MAX_PER_IP) {
      return NextResponse.json(
        { error: "Trop de messages envoyés. Veuillez réessayer dans quelques minutes." },
        { status: 429 }
      );
    }

    // Honeypot (champ caché du formulaire) rempli : robot. On fait comme si de rien n'était.
    if (website) {
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    // Détection de spam
    const combinedText = `${name} ${subject} ${message}`;
    if (containsSpam(combinedText)) {
      return NextResponse.json(
        { error: "Message détecté comme spam." },
        { status: 400 }
      );
    }

    // Détection d'insultes
    if (containsOffensiveContent(combinedText)) {
      return NextResponse.json(
        { error: "Votre message contient du contenu inapproprié. Veuillez reformuler votre message de manière respectueuse." },
        { status: 400 }
      );
    }

    // Créer le message de contact
    const contact = await Contact.create({
      name,
      email,
      subject,
      message,
      creationId: creationId || null,
      creationIds: finalCreationIds.length > 0 ? finalCreationIds : undefined,
      userId: session?.user?.id || null,
      status: "new",
    });

    // Données utilisateur échappées avant interpolation dans le HTML des emails
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    // Objet du mail : une seule ligne, sans caractères de contrôle
    const subjectLine = subject.replace(/[\p{Cc}\p{Cf}\u2028\u2029]+/gu, " ").trim();
    const safeMessage = escapeHtml(message);

    const emails: Promise<unknown>[] = [];

    // Envoyer un email à l'admin
    if (process.env.SELLER_EMAIL) {
      let creationInfo = '';
      
      if (finalCreationIds.length > 0) {
        try {
          const creations = await Creation.find({ _id: { $in: finalCreationIds } });
          if (creations.length > 0) {
            const creationsHtml = creations.map((creation) => {
              const imageUrl = creation.imageUrl || (creation.images && creation.images[0]) || '';
              const statusBadge = creation.sold 
                ? '<span style="background:#ef4444;color:white;padding:4px 8px;border-radius:6px;font-size:12px;font-weight:600;">Vendu</span>'
                : creation.reserved
                ? '<span style="background:#f59e0b;color:white;padding:4px 8px;border-radius:6px;font-size:12px;font-weight:600;">Réservé</span>'
                : '<span style="background:#10b981;color:white;padding:4px 8px;border-radius:6px;font-size:12px;font-weight:600;">Disponible</span>';

              return `
                <div style="margin:12px 0;padding:12px;background:#fef9c3;border-radius:8px;border:1px solid #fde68a;">
                  ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(creation.title)}" style="width:100%;max-width:200px;height:auto;border-radius:8px;margin-bottom:8px;"/>` : ''}
                  <p style="margin:0 0 6px 0;font-size:14px;font-weight:600;">${escapeHtml(creation.title)}</p>
                  ${creation.price ? `<p style="margin:0 0 6px 0;font-size:13px;">Prix : ${escapeHtml(creation.price)}€</p>` : ''}
                  ${creation.color ? `<p style="margin:0 0 6px 0;font-size:13px;">Couleur : ${escapeHtml(creation.color)}</p>` : ''}
                  <p style="margin:6px 0 0 0;">${statusBadge}</p>
                </div>
              `;
            }).join('');

            creationInfo = `
              <div style="margin:16px 0;padding:16px;background:#fef9c3;border-radius:12px;">
                <p style="margin:0 0 12px 0;font-weight:600;font-size:14px;">📦 Création${creations.length > 1 ? 's' : ''} concernée${creations.length > 1 ? 's' : ''} :</p>
                ${creationsHtml}
              </div>
            `;
          }
        } catch (err) {
          console.error("Erreur lors de la récupération des créations:", err);
        }
      }

      emails.push(sendEmail({
        to: process.env.SELLER_EMAIL,
        subject: `📧 Nouveau message : ${subjectLine}`,
        html: emailTemplate(`
            <h1 style="font-size:18px;margin:0 0 12px 0;">📧 Nouveau message de contact</h1>

            <div style="margin:16px 0;padding:16px;background:#f8fafc;border-radius:8px;">
              <p style="margin:0 0 8px 0;font-size:14px;"><strong>De :</strong> ${safeName}</p>
              <p style="margin:0 0 8px 0;font-size:14px;"><strong>Email :</strong> <a href="mailto:${safeEmail}" style="color:#0f172a;">${safeEmail}</a></p>
              <p style="margin:0;font-size:14px;"><strong>Sujet :</strong> ${safeSubject}</p>
            </div>

            <div style="margin:16px 0;">
              <p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#64748b;">Message :</p>
              <p style="margin:0;font-size:14px;white-space:pre-line;">${safeMessage}</p>
            </div>

            ${creationInfo}

            <p style="font-size:12px;margin-top:24px;color:#9ca3af;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin/contact" style="display:inline-block;background:#0f172a;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Voir tous les messages</a>
            </p>
        `),
      }));
    }

    // Accusé de réception : l'adresse n'est pas vérifiée, donc aucun texte saisi par
    // l'expéditeur (nom, sujet) n'y figure — sinon le formulaire servirait à envoyer des
    // messages arbitraires à n'importe qui depuis l'adresse de la boutique.
    emails.push(sendEmail({
      to: email,
      subject: "✅ Votre message a bien été reçu",
      html: emailTemplate(`
          <h1 style="font-size:18px;margin:0 0 12px 0;">Merci pour votre message !</h1>
          <p style="font-size:14px;margin:0 0 16px 0;">
            Bonjour,<br/><br/>
            Nous avons bien reçu votre message. Nous vous répondrons dans les plus brefs délais.
          </p>
          <p style="font-size:13px;margin:0;color:#6b7280;">Si vous n'êtes pas à l'origine de ce message, ignorez cet email.</p>
      `),
    }));

    // Le message est déjà enregistré : un email en échec ne doit pas faire échouer la requête
    for (const r of await Promise.allSettled(emails)) {
      if (r.status === "rejected") console.error("[contact] Email non envoyé:", r.reason);
    }

    return NextResponse.json({ ok: true, id: contact._id.toString() }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi du message." },
      { status: 500 }
    );
  }
}
