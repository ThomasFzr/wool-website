import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { z } from "zod";
import { parseBody, text } from "@/lib/validation";

// Uniquement des chaînes de taille raisonnable ; un champ absent n'est pas modifié
const profileSchema = z.object({
  name: text(100).optional(),
  phone: text(30).optional(),
  address: text(200).optional(),
  city: text(100).optional(),
  postalCode: text(10).optional(),
});

/**
 * PATCH /api/account/profile
 * Mettre à jour le profil de l'utilisateur connecté
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

    const parsed = await parseBody(req, profileSchema);
    if (!parsed.ok) return parsed.response;
    // zod ne garde que les champs connus et présents : aucune autre clé n'atteint $set
    const updateData = parsed.data;

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
      message: "Profil mis à jour",
      user: {
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        address: updatedUser.address,
        city: updatedUser.city,
        postalCode: updatedUser.postalCode,
      },
    });
  } catch (error) {
    console.error("Erreur PATCH /api/account/profile:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/account/profile
 * Récupérer le profil complet de l'utilisateur connecté
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Non authentifié" },
        { status: 401 }
      );
    }

    await connectToDatabase();

    const user = await User.findOne({ email: session.user.email })
      .select("-password -resetToken -resetTokenExpiry")
      .lean();

    if (!user) {
      return NextResponse.json(
        { error: "Utilisateur non trouvé" },
        { status: 404 }
      );
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Erreur GET /api/account/profile:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
