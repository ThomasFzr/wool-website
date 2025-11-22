import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export async function POST(req: NextRequest, { params }: any) {
  try {
    // 🔐 Vérifier si utilisateur loggé
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await connectToDatabase();

    // ID de la création
    const creationId = params.id;

    // Champs envoyés par le formulaire
    const { name, contact, message } = await req.json();

    // Vérifier si la création existe
    const creation = await Creation.findById(creationId);
    if (!creation) {
      return new NextResponse("Création introuvable", { status: 404 });
    }

    // Déjà réservé ?
    if (creation.reserved) {
      return new NextResponse("Déjà réservé", { status: 409 });
    }

    // 🆕 Ajout dans Reservation, AVEC userId
    const reservation = await Reservation.create({
      creationId,
      userId: (session.user as any).id, // 🔥 on stocke l’utilisateur loggué
      name,
      contact,
      message,
      status: "pending",
    });

    // Mise à jour de la création
    creation.reserved = true;
    creation.reservedName = name;
    creation.reservedContact = contact;
    creation.reservedMessage = message;
    creation.reservedAt = new Date();
    await creation.save();

    return NextResponse.json(reservation, { status: 201 });

  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}