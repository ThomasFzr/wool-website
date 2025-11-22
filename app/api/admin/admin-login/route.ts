import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const headerPassword = req.headers.get("x-admin-password");

  if (!adminPassword || headerPassword !== adminPassword) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Juste un ping de login, pas de payload sensible
  return NextResponse.json({ ok: true });
}