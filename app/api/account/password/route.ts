import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import bcrypt from "bcryptjs";

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

    const body = await req.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Mots de passe requis" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 6 caractères" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const user = await User.findOne({ email: session.user.email });
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

    // Hasher et enregistrer le nouveau mot de passe
    user.password = await bcrypt.hash(newPassword, 10);
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
