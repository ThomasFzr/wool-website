import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import Contact from "@/models/Contact";
import Creation from "@/models/Creation";
import { sendEmail } from "@/lib/sendEmail";
import { emailTemplate } from "@/lib/emailTemplate";
import { escapeHtml } from "@/lib/escape";

// Rate limiting en mémoire (best-effort : en serverless chaque instance a sa
// propre Map — suffisant pour freiner l'abus, purge paresseuse à chaque appel)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(identifier: string, maxRequests = 3, windowMs = 60000): boolean {
  const now = Date.now();

  // Purge paresseuse des entrées expirées (pas de setInterval qui retient le process)
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key);
    }
  }

  const record = rateLimitMap.get(identifier);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count++;
  return true;
}

// Détection de spam
function containsSpam(text: string): boolean {
  const spamPatterns = [
    /\b(viagra|cialis|casino|lottery|winner|cryptocurrency|bitcoin)\b/i,
    /https?:\/\/[^\s]+\.(ru|cn|tk)/i, // Domaines suspects
    /<a\s+href=/i, // Liens HTML
    /\b\d{10,}\b/, // Trop de chiffres consécutifs
  ];
  return spamPatterns.some(pattern => pattern.test(text));
}

// Détection d'insultes et langage offensant
function containsOffensiveContent(text: string): boolean {
  const offensiveWords = [
    // Insultes courantes en français
    /\b(connard|connasse|salope|putain|pute|merde|chier|enculé|enculer|fdp|con|conne|bite|couille|pd|pédé)\b/i,
    /\b(ta gueule|ferme ta|nique|niker|niquer|enc[uû]l|baiser|bâtard|batard|crevard|débile|abruti)\b/i,
    /\b(idiot|imbécile|crétin|taré|mongol|attardé|salaud|ordure|mec de merde|fils de|enfoiré)\b/i,
    // Insultes en anglais
    /\b(fuck|fucking|shit|bitch|asshole|bastard|cunt|dick|pussy)\b/i,
    // Variantes avec caractères spéciaux
    /c[o0@]nn[a4@]rd/i,
    /p[uù]t[a4@][1il]n/i,
    /m[e3]rd[e3]/i,
  ];
  return offensiveWords.some(pattern => pattern.test(text));
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    await connectToDatabase();

    const { name, email, subject, message, creationId, creationIds } = await req.json();

    // Validation de base
    if (!name || !email || !subject || !message) {
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

    // Rate limiting par email
    const rateLimitKey = session?.user?.id || email.toLowerCase();
    if (!checkRateLimit(rateLimitKey, 3, 60000)) {
      return NextResponse.json(
        { error: "Trop de messages envoyés. Veuillez réessayer dans quelques minutes." },
        { status: 429 }
      );
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

    // Déterminer les IDs de créations à utiliser
    let finalCreationIds: string[] = [];
    if (creationIds && Array.isArray(creationIds) && creationIds.length > 0) {
      finalCreationIds = creationIds;
    } else if (creationId) {
      finalCreationIds = [creationId];
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
                  ${imageUrl ? `<img src="${imageUrl}" alt="${escapeHtml(creation.title)}" style="width:100%;max-width:200px;height:auto;border-radius:8px;margin-bottom:8px;"/>` : ''}
                  <p style="margin:0 0 6px 0;font-size:14px;font-weight:600;">${escapeHtml(creation.title)}</p>
                  ${creation.price ? `<p style="margin:0 0 6px 0;font-size:13px;">Prix : ${creation.price}€</p>` : ''}
                  ${creation.color ? `<p style="margin:0 0 6px 0;font-size:13px;">Couleur : ${creation.color}</p>` : ''}
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
        subject: `📧 Nouveau message : ${subject}`,
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

    // Envoyer un email de confirmation à l'utilisateur
    emails.push(sendEmail({
      to: email,
      subject: "✅ Votre message a bien été reçu",
      html: emailTemplate(`
          <h1 style="font-size:18px;margin:0 0 12px 0;">Merci pour votre message !</h1>
          <p style="font-size:14px;margin:0 0 16px 0;">
            Bonjour <strong>${safeName}</strong>,<br/><br/>
            Nous avons bien reçu votre message concernant "<strong>${safeSubject}</strong>". Nous vous répondrons dans les plus brefs délais.
          </p>
      `),
    }));

    // Le message est déjà enregistré : un email en échec ne doit pas faire échouer la requête
    for (const r of await Promise.allSettled(emails)) {
      if (r.status === "rejected") console.error("[contact] Email non envoyé:", r.reason);
    }

    return NextResponse.json(contact, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi du message." },
      { status: 500 }
    );
  }
}
