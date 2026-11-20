import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Contact from "@/models/Contact";
import { checkAdminAuth } from "@/lib/auth";
import { z } from "zod";
import { idParams, parseBody, parseParams } from "@/lib/validation";
import { CONTACT_STATUSES } from "@/models/Contact";

const statusSchema = z.object({
  status: z.enum(CONTACT_STATUSES, "Statut invalide"),
});

type AdminContactRouteContext = {
  params: Promise<{ id: string }>;
};

// PATCH : Mettre à jour le statut d'un message
export async function PATCH(req: NextRequest, context: AdminContactRouteContext) {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const parsedParams = await parseParams(context.params, idParams);
    if (!parsedParams.ok) return parsedParams.response;
    const { id } = parsedParams.data;

    const parsed = await parseBody(req, statusSchema);
    if (!parsed.ok) return parsed.response;
    const { status } = parsed.data;

    await connectToDatabase();

    const contact = await Contact.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!contact) {
      return new NextResponse("Message introuvable", { status: 404 });
    }

    return NextResponse.json(contact);
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}

// DELETE : Supprimer un message
export async function DELETE(req: NextRequest, context: AdminContactRouteContext) {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const parsedParams = await parseParams(context.params, idParams);
    if (!parsedParams.ok) return parsedParams.response;
    const { id } = parsedParams.data;

    await connectToDatabase();

    const contact = await Contact.findByIdAndDelete(id);

    if (!contact) {
      return new NextResponse("Message introuvable", { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}
