import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { clientIp, hitRateLimit } from "@/lib/rate-limit";
import { checkNewPassword } from "@/lib/password-policy";
import { z } from "zod";
import { email, parseBody, password, text } from "@/lib/validation";

const registerSchema = z.object({
  name: text(100).optional(),
  email,
  password,
});

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

    const parsed = await parseBody(req, registerSchema);
    if (!parsed.ok) return parsed.response;
    const { name, email: normalizedEmail, password } = parsed.data;

    const passwordError = await checkNewPassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return NextResponse.json({ error: "Un compte existe déjà avec cet email" }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 10);

    await User.create({
      name: name || undefined,
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
