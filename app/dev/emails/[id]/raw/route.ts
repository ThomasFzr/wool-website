import { NextResponse } from "next/server";
import { readCapturedEmail } from "@/lib/emailOutbox";

/**
 * Renvoie le HTML brut d'un email capturé, pour l'afficher dans l'iframe
 * d'aperçu de /dev/emails. Outil de développement : 404 en production.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const { id } = await params;
  const email = await readCapturedEmail(id);

  if (!email) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(email.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Pas d'indexation, pas de mise en cache d'un contenu de test
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
