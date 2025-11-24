import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Contact from "@/models/Contact";
import { checkAdminAuth } from "@/lib/auth";

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

    await connectToDatabase();

    const { id } = await context.params;
    const { status } = await req.json();

    if (!["new", "read", "replied", "archived"].includes(status)) {
      return NextResponse.json(
        { error: "Statut invalide" },
        { status: 400 }
      );
    }

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

    await connectToDatabase();

    const { id } = await context.params;

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
