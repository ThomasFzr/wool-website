import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { GET } from "@/app/api/admin/stats/route";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import { readJson } from "../../../helpers/http";
import { asAdmin } from "../../../helpers/session";
import { createCreation, createReservation, expectAdminOnly, failSession } from "../../../helpers/admin-fixtures";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));

// Seule l'horloge Date est figée (les timers restent réels pour le driver MongoDB)
const NOW = new Date(2026, 5, 15, 12); // 15 juin 2026, heure locale
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 3600 * 1000);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  await connectToDatabase();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/admin/stats", () => {
  it("est réservé aux admins", async () => {
    await expectAdminOnly(() => GET());
  });

  it("renvoie des compteurs à zéro sur une base vide", async () => {
    asAdmin();
    const { status, body } = await readJson(await GET());
    expect(status).toBe(200);
    expect(body.orders).toEqual({
      total: 0, preparing: 0, validated: 0, cancelled: 0, shipped: 0, in_transit: 0, delivered: 0,
      last7Days: 0, last30Days: 0, validatedLast7Days: 0, validatedLast30Days: 0,
    });
    expect(body.creations).toEqual({ total: 0, sold: 0, available: 0 });
    expect(body.revenue).toEqual({ total: 0, average: 0, last30Days: 0, soldLast30Days: 0, totalSales: 0, soldCreations: [] });
    expect(body.monthlyData).toHaveLength(12);
    expect(body.monthlyData[0].month).toBe("juil. 2025");
    expect(body.monthlyData[11]).toEqual({ month: "juin 2026", orders: 0, validated: 0, revenue: 0, cost: 0, profit: 0, sold: 0 });
  });

  it("classe chaque commande selon le statut le plus avancé de ses articles", async () => {
    await createReservation({ stripeCheckoutSessionId: "S1", status: "validated" });
    await createReservation({ stripeCheckoutSessionId: "S1", status: "shipped" });
    await Reservation.collection.insertOne({ stripeCheckoutSessionId: "S1", createdAt: NOW, updatedAt: NOW });
    await createReservation({ stripeCheckoutSessionId: "S2", status: "preparing" });
    await createReservation({ status: "pending" }); // sans session : commande à part entière
    await createReservation({ stripeCheckoutSessionId: "S3", status: "cancelled" });
    await createReservation({ stripeCheckoutSessionId: "S3", status: "delivered" });
    await createReservation({ stripeCheckoutSessionId: "S4", status: "shipped" });
    await createReservation({ stripeCheckoutSessionId: "S5", status: "in_transit" });
    await createReservation({ stripeCheckoutSessionId: "S6", status: "cancelled" });
    // Statut absent (donnée ancienne) : comptée dans le total mais dans aucune catégorie
    await Reservation.collection.insertOne({ stripeCheckoutSessionId: "S7", createdAt: NOW, updatedAt: NOW });
    asAdmin();

    const { body } = await readJson(await GET());
    expect(body.orders).toMatchObject({
      total: 8,
      preparing: 2,
      validated: 1,
      cancelled: 1,
      shipped: 1,
      in_transit: 1,
      delivered: 1,
      last7Days: 8,
      last30Days: 8,
      validatedLast7Days: 0,
    });
  });

  it("calcule ventes, revenus, coûts et l'historique mensuel", async () => {
    const a = await createCreation({ title: "A", price: 100, salesCount: 2, weight: 200, yarnPrice: 5, sold: true, imageUrl: "a.jpg" });
    const b = await createCreation({ title: "B", price: 0, salesCount: 1, yarnPrice: 5, sold: true });
    const c = await createCreation({ title: "C", price: 40, salesCount: 1, weight: 100, yarnPrice: 3, sold: true });
    const d = await createCreation({ title: "D", price: 30, weight: 100, yarnPrice: 2 });
    const e = await createCreation({ title: "E", price: 20, salesCount: 1, weight: 50, yarnPrice: 4, sold: true, createdAt: new Date(2025, 11, 10) });

    // Vente récente de A
    await createReservation({ creationId: a._id, stripeCheckoutSessionId: "SA", paymentStatus: "paid", paidAt: daysAgo(1), createdAt: daysAgo(1) });
    // Vente de C sans paidAt : la date de mise à jour fait foi
    const c20 = daysAgo(20);
    await Reservation.collection.insertOne({ creationId: c._id, stripeCheckoutSessionId: "SC", paymentStatus: "paid", createdAt: c20, updatedAt: c20 });
    // Vente ancienne de D (hors fenêtre de 30 jours)
    await createReservation({ creationId: d._id, stripeCheckoutSessionId: "SD", paymentStatus: "paid", paidAt: daysAgo(60), createdAt: daysAgo(60) });
    // Vente dont la création a été supprimée
    await createReservation({ creationId: new mongoose.Types.ObjectId(), stripeCheckoutSessionId: "SX", paymentStatus: "paid", paidAt: daysAgo(2), createdAt: daysAgo(2) });
    // Commande non payée
    await createReservation({ creationId: b._id, stripeCheckoutSessionId: "SP", createdAt: daysAgo(3) });
    asAdmin();

    const { status, body } = await readJson(await GET());
    expect(status).toBe(200);
    expect(body.orders).toMatchObject({ total: 5, last7Days: 3, validatedLast7Days: 2, last30Days: 4, validatedLast30Days: 3 });
    expect(body.creations).toEqual({ total: 5, sold: 4, available: 1 });
    expect(body.revenue).toMatchObject({ total: 260, totalSales: 5, average: 52, last30Days: 140, soldLast30Days: 3 });

    const sold = body.revenue.soldCreations;
    expect(sold.map((s: any) => s.title).slice(0, 2)).toEqual(["A", "C"]);
    expect(sold.map((s: any) => s.title).slice(2).sort()).toEqual(["B", "E"]);
    expect(sold[0]).toEqual({
      _id: a.id, title: "A", price: 100, salesCount: 2, totalRevenue: 200, unitCost: 10, totalCost: 20,
      profit: 180, imageUrl: "a.jpg", lastSaleDate: daysAgo(1).toISOString(),
    });
    expect(sold[1].lastSaleDate).toBe(c20.toISOString());
    const byTitle = Object.fromEntries(sold.map((s: any) => [s.title, s]));
    expect(byTitle.B).toMatchObject({ price: 0, unitCost: 0, totalRevenue: 0, profit: 0, lastSaleDate: null });
    expect(byTitle.E).toMatchObject({ unitCost: 2, totalCost: 2, profit: 18, lastSaleDate: null });
    expect(e.id).toBe(byTitle.E._id);

    const months = Object.fromEntries(body.monthlyData.map((m: any) => [m.month, m]));
    // Juin : commandes SA, SX (payées) et SP ; vente de A ; coûts des créations A, C, D créées ce mois
    expect(months["juin 2026"]).toEqual({ month: "juin 2026", orders: 3, validated: 2, revenue: 100, cost: 15, profit: 85, sold: 1 });
    expect(months["mai 2026"]).toEqual({ month: "mai 2026", orders: 1, validated: 1, revenue: 40, cost: 0, profit: 40, sold: 1 });
    expect(months["avr. 2026"]).toEqual({ month: "avr. 2026", orders: 1, validated: 1, revenue: 30, cost: 0, profit: 30, sold: 1 });
    expect(months["déc. 2025"]).toEqual({ month: "déc. 2025", orders: 0, validated: 0, revenue: 0, cost: 2, profit: -2, sold: 0 });
  });

  it("répond 500 en cas d'erreur", async () => {
    failSession();
    const { status, body } = await readJson(await GET());
    expect(status).toBe(500);
    expect(body.error).toBe("Server error");
  });
});
