import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Contact from "@/models/Contact";
import { checkAdminAuth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await connectToDatabase();

    const newCount = await Contact.countDocuments({ status: "new" });

    return NextResponse.json({ new: newCount });
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}
