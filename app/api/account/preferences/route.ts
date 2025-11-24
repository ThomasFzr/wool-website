import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";

/**
 * PATCH /api/account/preferences
 * Mettre à jour les préférences de l'utilisateur connecté
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
    const { emailNotifications } = body;

    await connectToDatabase();

    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json(
        { error: "Utilisateur non trouvé" },
        { status: 404 }
      );
    }

    // Mettre à jour les préférences en préservant les autres champs
    const updateData: any = {};
    if (emailNotifications !== undefined) {
      updateData.emailNotifications = emailNotifications;
    }

    const updatedUser = await User.findOneAndUpdate(
      { email: session.user.email },
      { $set: updateData },
      { new: true, runValidators: false }
    );

    return NextResponse.json({
      message: "Préférences mises à jour",
      preferences: {
        emailNotifications: updatedUser?.emailNotifications,
      },
    });
  } catch (error) {
    console.error("Erreur PATCH /api/account/preferences:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
