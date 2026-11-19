// app/api/auth/reset-password/route.ts
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { checkNewPassword } from "@/lib/password-policy";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();

    if (typeof token !== "string" || typeof password !== "string" || !token || !password) {
      return NextResponse.json(
        { error: "Token et mot de passe requis" },
        { status: 400 }
      );
    }

    const passwordError = await checkNewPassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    await connectToDatabase();

    // La base stocke le hash du token (cf. forgot-password), on compare donc le hash
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Trouver l'utilisateur avec le token valide
    const user = await User.findOne({
      resetToken: hashedToken,
      resetTokenExpiry: mongoose.trusted({ $gt: new Date() }), // Le token n'a pas expiré
    });

    if (!user) {
      return NextResponse.json(
        { error: "Token invalide ou expiré" },
        { status: 400 }
      );
    }

    // Hasher le nouveau mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Mettre à jour le mot de passe et supprimer le token
    user.password = hashedPassword;
    user.resetToken = null;
    user.resetTokenExpiry = null;
    // Révoque les sessions ouvertes avant (cf. callback jwt)
    user.passwordChangedAt = new Date();
    // Le lien a été reçu dans la boîte mail : l'adresse est prouvée
    user.emailVerifiedAt ??= new Date();
    await user.save();

    return NextResponse.json(
      { message: "Mot de passe réinitialisé avec succès" },
      { status: 200 }
    );
  } catch (error) {
    console.error("[reset-password] Error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la réinitialisation du mot de passe" },
      { status: 500 }
    );
  }
}
