import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { releaseStaleLocks } from "@/lib/stale-locks";

/**
 * GET /api/cron/release-locks — appelé par le cron Vercel (vercel.json).
 * Vercel envoie `Authorization: Bearer $CRON_SECRET` ; sans secret configuré,
 * la route refuse tout appel.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const report = await releaseStaleLocks();
    return NextResponse.json(report);
  } catch (err) {
    console.error("[CRON] release-locks :", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
