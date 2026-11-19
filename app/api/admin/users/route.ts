import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { checkAdminAuth } from "@/lib/auth";
import { checkNewPassword } from "@/lib/password-policy";

/**
 * GET /api/admin/users
 * Liste tous les utilisateurs (admin only)
 */
export async function GET(req: NextRequest) {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return NextResponse.json(
        { error: "Non autorisé" },
        { status: 401 }
      );
    }

    await connectToDatabase();

    const users = await User.find({})
      .select("-password -resetToken -resetTokenExpiry")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(users);
  } catch (error) {
    console.error("Erreur GET /api/admin/users:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/users
 * Créer un nouvel utilisateur (admin only)
 */
export async function POST(req: NextRequest) {
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

    if (!email) {
      return NextResponse.json(
        { error: "L'email est requis" },
        { status: 400 }
      );
    }

    // Mot de passe facultatif (compte sans mot de passe sinon) ; s'il est fourni, même
    // politique que l'inscription (lib/password-policy)
    if (password) {
      const passwordError = await checkNewPassword(password);
      if (passwordError) {
        return NextResponse.json({ error: passwordError }, { status: 400 });
      }
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    await connectToDatabase();

    // Vérifier si l'email existe déjà
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return NextResponse.json(
        { error: "Cet email est déjà utilisé" },
        { status: 400 }
      );
    }

    const hashedPassword = password ? await bcrypt.hash(password, 10) : undefined;

    const newUser = await User.create({
      name: name || null,
      email: normalizedEmail,
      provider: password ? "credentials" : "admin-created",
      password: hashedPassword,
      role: role || "user",
      phone: phone || null,
      address: address || null,
      city: city || null,
      postalCode: postalCode || null,
      emailNotifications: emailNotifications ?? true,
    });

    const userResponse = {
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      provider: newUser.provider,
      phone: newUser.phone,
      address: newUser.address,
      city: newUser.city,
      postalCode: newUser.postalCode,
      emailNotifications: newUser.emailNotifications,
      createdAt: newUser.createdAt,
    };

    return NextResponse.json(userResponse, { status: 201 });
  } catch (error) {
    console.error("Erreur POST /api/admin/users:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
