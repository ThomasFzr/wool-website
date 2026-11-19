import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { clientIp, hitRateLimit } from "@/lib/rate-limit";
import { checkNewPassword } from "@/lib/password-policy";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Inscriptions par IP et par heure (création de comptes en masse)
const REGISTER_MAX_PER_IP = 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    if ((await hitRateLimit(`register:ip:${clientIp(req.headers)}`, REGISTER_WINDOW_MS)) > REGISTER_MAX_PER_IP) {
      return NextResponse.json(
        { error: "Trop d'inscriptions depuis cette connexion. Réessayez plus tard." },
        { status: 429 }
      );
    }

    const { name, email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email et mot de passe requis" }, { status: 400 });
    }

    if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
      return NextResponse.json({ error: "Email invalide" }, { status: 400 });
    }

    if (name && (typeof name !== "string" || name.length > 100)) {
      return NextResponse.json({ error: "Nom invalide" }, { status: 400 });
    }

    const passwordError = await checkNewPassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return NextResponse.json({ error: "Un compte existe déjà avec cet email" }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 10);

    await User.create({
      name,
      email: normalizedEmail,
      password: hashed,
      provider: "credentials",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erreur serveur, réessayez plus tard" }, { status: 500 });
  }
}
