import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import Contact from "@/models/Contact";
import Creation from "@/models/Creation";
import { sendEmail } from "@/lib/sendEmail";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    await connectToDatabase();

    const { name, email, subject, message, creationId } = await req.json();

    // Validation
    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: "Tous les champs sont requis." },
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
