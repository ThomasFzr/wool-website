import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import Contact from "@/models/Contact";
import Creation from "@/models/Creation";
import { sendEmail } from "@/lib/sendEmail";

// Rate limiting en mémoire (simple)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(identifier: string, maxRequests = 3, windowMs = 60000): boolean {
  const now = Date.now();
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

// Nettoyage périodique de la map
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 60000);

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

    const { name, email, subject, message, creationId } = await req.json();

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

    // Créer le message de contact
    const contact = await Contact.create({
      name,
      email,
      subject,
      message,
      creationId: creationId || null,
      userId: session?.user?.id || null,
      status: "new",
    });

    // Envoyer un email à l'admin
    if (process.env.SELLER_EMAIL) {
      let creationInfo = '';
      
      if (creationId) {
        try {
          const creation = await Creation.findById(creationId);
          if (creation) {
            const imageUrl = creation.imageUrl || (creation.images && creation.images[0]) || '';
            const statusBadge = creation.sold 
              ? '<span style="background:#ef4444;color:white;padding:4px 8px;border-radius:6px;font-size:12px;font-weight:600;">Vendu</span>'
              : creation.reserved
              ? '<span style="background:#f59e0b;color:white;padding:4px 8px;border-radius:6px;font-size:12px;font-weight:600;">Réservé</span>'
              : '<span style="background:#10b981;color:white;padding:4px 8px;border-radius:6px;font-size:12px;font-weight:600;">Disponible</span>';

            creationInfo = `
              <div style="margin:16px 0;padding:16px;background:#fef9c3;border-radius:12px;">
                <p style="margin:0 0 12px 0;font-weight:600;font-size:14px;">📦 Création concernée :</p>
                ${imageUrl ? `<img src="${imageUrl}" alt="${creation.title}" style="width:100%;max-width:300px;height:auto;border-radius:8px;margin-bottom:12px;"/>` : ''}
                <p style="margin:0 0 6px 0;font-size:14px;font-weight:600;">${creation.title}</p>
                ${creation.price ? `<p style="margin:0 0 6px 0;font-size:14px;">Prix : ${creation.price}€</p>` : ''}
                ${creation.color ? `<p style="margin:0 0 6px 0;font-size:14px;">Couleur : ${creation.color}</p>` : ''}
                <p style="margin:6px 0 0 0;">${statusBadge}</p>
              </div>
            `;
          }
        } catch (err) {
          console.error("Erreur lors de la récupération de la création:", err);
        }
      }

      await sendEmail({
        to: process.env.SELLER_EMAIL,
        subject: `📧 Nouveau message : ${subject}`,
        html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; color:#0f172a; background:#f8fafc; padding:24px;">
          <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;padding:24px;border:1px solid #e5e7eb;">
            <h1 style="font-size:18px;margin:0 0 12px 0;">📧 Nouveau message de contact</h1>
            
            <div style="margin:16px 0;padding:16px;background:#f8fafc;border-radius:8px;">
              <p style="margin:0 0 8px 0;font-size:14px;"><strong>De :</strong> ${name}</p>
              <p style="margin:0 0 8px 0;font-size:14px;"><strong>Email :</strong> <a href="mailto:${email}" style="color:#0f172a;">${email}</a></p>
              <p style="margin:0;font-size:14px;"><strong>Sujet :</strong> ${subject}</p>
            </div>

            <div style="margin:16px 0;">
              <p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#64748b;">Message :</p>
              <p style="margin:0;font-size:14px;white-space:pre-line;">${message}</p>
            </div>

            ${creationInfo}

            <p style="font-size:12px;margin-top:24px;color:#9ca3af;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin/contact" style="display:inline-block;background:#0f172a;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Voir tous les messages</a>
            </p>
          </div>
        </div>
        `,
      });
    }

    // Envoyer un email de confirmation à l'utilisateur
    await sendEmail({
      to: email,
      subject: "✅ Votre message a bien été reçu",
      html: `
      <div style="font-family: system-ui, -apple-system, sans-serif; color:#0f172a; background:#f8fafc; padding:24px;">
        <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;padding:24px;border:1px solid #e5e7eb;">
          <h1 style="font-size:18px;margin:0 0 12px 0;">Merci pour votre message !</h1>
          <p style="font-size:14px;margin:0 0 16px 0;">
            Bonjour <strong>${name}</strong>,<br/><br/>
            Nous avons bien reçu votre message concernant "<strong>${subject}</strong>". Nous vous répondrons dans les plus brefs délais.
          </p>

          <p style="font-size:11px;margin-top:24px;color:#9ca3af;">
            Cet email est généré automatiquement par MailleMum.
          </p>
        </div>
      </div>
      `,
    });

    return NextResponse.json(contact, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi du message." },
      { status: 500 }
    );
  }
}
