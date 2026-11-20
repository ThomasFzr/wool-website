import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import { checkNewPassword } from "@/lib/password-policy";
import { z } from "zod";
import { parseBody, password } from "@/lib/validation";

const passwordChangeSchema = z.object({
  currentPassword: password,
  newPassword: password,
});

/**
 * PATCH /api/account/password
 * Changer le mot de passe de l'utilisateur connecté
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Non authentifié" },
        { status: 401 }
      );
    }

    const parsed = await parseBody(req, passwordChangeSchema);
    if (!parsed.ok) return parsed.response;
    const { currentPassword, newPassword } = parsed.data;

    await connectToDatabase();

    // password est en select:false dans le schéma → il faut le demander explicitement
    const user = await User.findOne({ email: session.user.email }).select("+password");
    if (!user) {
      return NextResponse.json(
        { error: "Utilisateur non trouvé" },
        { status: 404 }
      );
    }

    // Vérifier que l'utilisateur utilise le provider credentials
    if (user.provider !== "credentials") {
      return NextResponse.json(
        { error: "Impossible de changer le mot de passe pour ce type de compte" },
        { status: 400 }
      );
    }

    // Vérifier le mot de passe actuel
    if (!user.password) {
      return NextResponse.json(
        { error: "Aucun mot de passe défini" },
        { status: 400 }
      );
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return NextResponse.json(
        { error: "Mot de passe actuel incorrect" },
        { status: 400 }
      );
    }

    const passwordError = await checkNewPassword(newPassword);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    // Hasher et enregistrer le nouveau mot de passe
    user.password = await bcrypt.hash(newPassword, 10);
    // Révoque les autres sessions ouvertes (cf. callback jwt) ; le formulaire reconnecte
    // l'utilisateur avec le nouveau mot de passe pour garder la session courante.
    user.passwordChangedAt = new Date();
    await user.save();

    return NextResponse.json({
      message: "Mot de passe mis à jour",
    });
  } catch (error) {
    console.error("Erreur PATCH /api/account/password:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
