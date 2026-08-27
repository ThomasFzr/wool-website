import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";

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

    const body = await req.json();
    const { name, phone, address, city, postalCode } = body;

    // Validation : uniquement des chaînes de taille raisonnable
    const fields: Record<string, { value: unknown; max: number }> = {
      name: { value: name, max: 100 },
      phone: { value: phone, max: 30 },
      address: { value: address, max: 200 },
      city: { value: city, max: 100 },
      postalCode: { value: postalCode, max: 10 },
    };

    const updateData: Record<string, string> = {};
    for (const [key, { value, max }] of Object.entries(fields)) {
      if (value === undefined) continue;
      if (typeof value !== "string" || value.length > max) {
        return NextResponse.json(
          { error: `Champ "${key}" invalide` },
          { status: 400 }
        );
      }
      updateData[key] = value;
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
