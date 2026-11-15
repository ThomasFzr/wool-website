import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { checkAdminAuth } from "@/lib/auth";
import { isInvalidInput } from "@/lib/validation-error";

/**
 * PATCH /api/admin/users/[id]
 * Mettre à jour un utilisateur (admin only)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return NextResponse.json(
        { error: "Non autorisé" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { name, email, role, password, phone, address, city, postalCode, emailNotifications } = body;

    await connectToDatabase();

    const { id } = await params;
    const user = mongoose.isValidObjectId(id) ? await User.findById(id) : null;
    if (!user) {
      return NextResponse.json(
        { error: "Utilisateur non trouvé" },
        { status: 404 }
      );
    }

    // Vérifier si l'email est déjà utilisé par un autre utilisateur (le schéma met les
    // emails en minuscules : on compare de même, et on ignore le compte lui-même)
    if (email && String(email).trim().toLowerCase() !== user.email) {
      const existingUser = await User.findOne({ email: String(email).trim().toLowerCase(), _id: { $ne: user._id } });
      if (existingUser) {
        return NextResponse.json(
          { error: "Cet email est déjà utilisé" },
          { status: 400 }
        );
      }
    }

    // Mettre à jour les champs avec findOneAndUpdate pour éviter les problèmes de validation
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (city !== undefined) updateData.city = city;
    if (postalCode !== undefined) updateData.postalCode = postalCode;
    if (emailNotifications !== undefined) updateData.emailNotifications = emailNotifications;

    // Si un nouveau mot de passe est fourni (même règle : 6 caractères minimum)
    if (password) {
      if (typeof password !== "string" || password.length < 6) {
        return NextResponse.json(
          { error: "Le mot de passe doit contenir au moins 6 caractères" },
          { status: 400 }
        );
      }
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: updateData },
      // Validateurs du schéma actifs : un rôle hors liste ("superadmin"…) est refusé
      { new: true, runValidators: true }
    );

    const userResponse = {
      _id: updatedUser?._id,
      name: updatedUser?.name,
      email: updatedUser?.email,
      role: updatedUser?.role,
      provider: updatedUser?.provider,
      phone: updatedUser?.phone,
      address: updatedUser?.address,
      city: updatedUser?.city,
      postalCode: updatedUser?.postalCode,
      emailNotifications: updatedUser?.emailNotifications,
      createdAt: updatedUser?.createdAt,
      updatedAt: updatedUser?.updatedAt,
    };

    return NextResponse.json(userResponse);
  } catch (error) {
    if (isInvalidInput(error)) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }
    console.error("Erreur PATCH /api/admin/users/[id]:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/users/[id]
 * Supprimer un utilisateur (admin only)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return NextResponse.json(
        { error: "Non autorisé" },
        { status: 401 }
      );
    }

    await connectToDatabase();

    const { id } = await params;
    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json(
        { error: "Utilisateur non trouvé" },
        { status: 404 }
      );
    }

    // Empêcher la suppression de son propre compte
    if (session.user.email === user.email) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas supprimer votre propre compte" },
        { status: 400 }
      );
    }

    await User.findByIdAndDelete(id);

    return NextResponse.json({ message: "Utilisateur supprimé" });
  } catch (error) {
    console.error("Erreur DELETE /api/admin/users/[id]:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
