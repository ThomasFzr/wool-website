import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import "@/models/Creation";

export async function GET(req: Request) {
    try {
        await connectToDatabase();

        const { searchParams } = new URL(req.url);

        const page = Number(searchParams.get("page") || 1);
        const limit = Number(searchParams.get("limit") || 10);
        const status = searchParams.get("status");
        const creationId = searchParams.get("creationId");
        const search = searchParams.get("search");

        const query: any = {};

        if (status) query.status = status;
        if (creationId) query.creationId = creationId;

        if (search) {
            const regex = { $regex: search, $options: "i" };
            query.$or = [
                { name: regex },
                { contact: regex },
                { message: regex },
            ];
        }

        const total = await Reservation.countDocuments(query);

        const reservations = await Reservation.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate("creationId", "title price images");

        return NextResponse.json({
            reservations,
            page,
            totalPages: Math.ceil(total / limit),
            total,
        });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}