import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";

export async function PATCH(req: Request, { params }: any) {
  try {
    await connectToDatabase();
    const body = await req.json();

    const reservation = await Reservation.findByIdAndUpdate(
      params.id,
      body,
      { new: true }
    );

    if (!reservation)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(reservation);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: any) {
  try {
    await connectToDatabase();

    const reservation = await Reservation.findByIdAndDelete(params.id);
    if (!reservation)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}