import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { z } from "zod";
import { parseBody } from "@/lib/validation";

const preferencesSchema = z.object({
  emailNotifications: z.boolean("Préférence d'email invalide.").optional(),
});

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

    const parsed = await parseBody(req, preferencesSchema);
    if (!parsed.ok) return parsed.response;
    const { emailNotifications } = parsed.data;

    const updateData: Record<string, boolean> = {};
    if (emailNotifications !== undefined) {
      updateData.emailNotifications = emailNotifications;
    }

    await connectToDatabase();

    const updatedUser = await User.findOneAndUpdate(
      { email: session.user.email },
      { $set: updateData },
      { new: true, runValidators: false }
    );

    if (!updatedUser) {
      return NextResponse.json(
        { error: "Utilisateur non trouvé" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: "Préférences mises à jour",
      preferences: {
        emailNotifications: updatedUser.emailNotifications,
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
