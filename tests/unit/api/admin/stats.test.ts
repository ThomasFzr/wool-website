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
const NOW = new Date("2026-06-15T10:00:00Z"); // 15 juin 2026, midi à Paris
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
    const paid = { paymentStatus: "paid" };
    await createReservation({ ...paid, stripeCheckoutSessionId: "S1", status: "validated" });
    await createReservation({ ...paid, stripeCheckoutSessionId: "S1", status: "shipped" });
    await Reservation.collection.insertOne({ stripeCheckoutSessionId: "S1", paymentStatus: "paid", createdAt: NOW, updatedAt: NOW });
    await createReservation({ ...paid, stripeCheckoutSessionId: "S2", status: "preparing" });
    await createReservation({ status: "pending" }); // sans session (commande manuelle) : commande à part entière
    await createReservation({ ...paid, stripeCheckoutSessionId: "S3", status: "cancelled" });
    await createReservation({ ...paid, stripeCheckoutSessionId: "S3", status: "delivered" });
    await createReservation({ ...paid, stripeCheckoutSessionId: "S4", status: "shipped" });
    await createReservation({ ...paid, stripeCheckoutSessionId: "S5", status: "in_transit" });
    await createReservation({ ...paid, stripeCheckoutSessionId: "S6", status: "cancelled" });
    // Statut absent (donnée ancienne) : comptée dans le total mais dans aucune catégorie
    await Reservation.collection.insertOne({ stripeCheckoutSessionId: "S7", paymentStatus: "paid", createdAt: NOW, updatedAt: NOW });
    // Paniers abandonnés (session Stripe jamais payée, expirée) : pas des commandes
    await createReservation({ stripeCheckoutSessionId: "ABANDON", status: "preparing" });
    await createReservation({ stripeCheckoutSessionId: "EXPIRE", status: "cancelled", paymentStatus: "failed" });
    asAdmin();

    const { body } = await readJson(await GET());
    expect(body.orders).toEqual({
      total: 8,
      preparing: 2,
      validated: 1,
      cancelled: 1,
      shipped: 1,
      in_transit: 1,
      delivered: 1,
      last7Days: 8,
      last30Days: 8,
      // Payées avec au moins un article non annulé (S6 est entièrement annulée)
      validatedLast7Days: 6,
      validatedLast30Days: 6,
    });
  });

  it("calcule le chiffre d'affaires au prix payé, frais de port compris, sans les annulations", async () => {
    const a = await createCreation({ title: "A", price: 120, weight: 200, yarnPrice: 5, sold: true, imageUrl: "a.jpg" });
    const c = await createCreation({ title: "C", price: 40, weight: 100, yarnPrice: 3, sold: true });
    // salesCount gonflé : il n'est plus la source des stats
    const d = await createCreation({ title: "D", price: 30, weight: 100, yarnPrice: 2, salesCount: 7 });

    // Commande SA : A vendue 100 € (prix augmenté depuis) + 5 € de port
    await createReservation({ creationId: a._id, stripeCheckoutSessionId: "SA", paymentStatus: "paid", price: 100, shippingCost: 5, paidAt: daysAgo(1), createdAt: daysAgo(1) });
    // Commande SC ancienne, sans prix figé ni paidAt : prix actuel, date de mise à jour
    const c20 = daysAgo(20);
    await Reservation.collection.insertOne({ creationId: c._id, stripeCheckoutSessionId: "SC", paymentStatus: "paid", status: "delivered", createdAt: c20, updatedAt: c20 });
    // Commande SD de deux articles hors fenêtre de 30 jours ; l'article portant le port est
    // annulé mais l'autre est livré : le port reste dû
    await createReservation({ creationId: d._id, stripeCheckoutSessionId: "SD", paymentStatus: "paid", price: 30, status: "cancelled", shippingCost: 6, paidAt: daysAgo(60), createdAt: daysAgo(60) });
    await createReservation({ creationId: d._id, stripeCheckoutSessionId: "SD", paymentStatus: "paid", price: 25, status: "delivered", paidAt: daysAgo(60), createdAt: daysAgo(60) });
    // Commande entièrement annulée (port compris) et commande remboursée : aucun revenu
    await createReservation({ creationId: c._id, stripeCheckoutSessionId: "SK", paymentStatus: "paid", price: 40, shippingCost: 5, status: "cancelled", paidAt: daysAgo(2), createdAt: daysAgo(2) });
    await createReservation({ creationId: c._id, stripeCheckoutSessionId: "SR", paymentStatus: "refunded", price: 40, paidAt: daysAgo(2), createdAt: daysAgo(2) });
    // Vente dont la création a été supprimée : prix figé conservé
    await createReservation({ creationId: new mongoose.Types.ObjectId(), stripeCheckoutSessionId: "SX", paymentStatus: "paid", price: 15, paidAt: daysAgo(2), createdAt: daysAgo(2) });
    // Panier abandonné
    await createReservation({ creationId: c._id, stripeCheckoutSessionId: "SP", price: 40, createdAt: daysAgo(3) });
    asAdmin();

    const { status, body } = await readJson(await GET());
    expect(status).toBe(200);
    expect(body.orders).toMatchObject({ total: 5, last7Days: 3, validatedLast7Days: 2, last30Days: 4, validatedLast30Days: 3 });
    expect(body.creations).toEqual({ total: 3, sold: 2, available: 1 });
    // Articles : 100 + 40 + 25 + 15 = 180 ; port : 5 (SA) + 6 (SD) = 11
    expect(body.revenue).toMatchObject({ total: 191, totalSales: 4, average: 45, last30Days: 160, soldLast30Days: 3 });

    const sold = body.revenue.soldCreations;
    expect(sold.map((s: any) => s.title)).toEqual(["A", "Création supprimée", "C", "D"]);
    expect(sold[0]).toEqual({
      _id: a.id, title: "A", price: 120, salesCount: 1, totalRevenue: 100, unitCost: 10, totalCost: 10,
      profit: 90, imageUrl: "a.jpg", lastSaleDate: daysAgo(1).toISOString(),
    });
    expect(sold[1]).toMatchObject({ _id: "deleted", price: 0, unitCost: 0, totalRevenue: 15 });
    expect(sold[2]).toMatchObject({ _id: c.id, salesCount: 1, totalRevenue: 40, lastSaleDate: c20.toISOString() });
    expect(sold[3]).toMatchObject({ _id: d.id, salesCount: 1, totalRevenue: 25, unitCost: 2, profit: 23 });

    const months = Object.fromEntries(body.monthlyData.map((m: any) => [m.month, m]));
    // Juin : commandes SA, SK, SX (SR remboursée et SP abandonnée exclues) ; coûts de A, C, D créées ce mois
    expect(months["juin 2026"]).toEqual({ month: "juin 2026", orders: 3, validated: 2, revenue: 120, cost: 15, profit: 105, sold: 2 });
    expect(months["mai 2026"]).toEqual({ month: "mai 2026", orders: 1, validated: 1, revenue: 40, cost: 0, profit: 40, sold: 1 });
    expect(months["avr. 2026"]).toEqual({ month: "avr. 2026", orders: 1, validated: 1, revenue: 31, cost: 0, profit: 31, sold: 1 });
  });

  it("range ventes et coûts dans les mois civils de Paris", async () => {
    // 31 mai 23 h 30 UTC = 1er juin 1 h 30 à Paris
    const boundary = new Date("2026-05-31T23:30:00Z");
    const e = await createCreation({ title: "E", price: 20, weight: 50, yarnPrice: 4, createdAt: boundary });
    await createReservation({ creationId: e._id, stripeCheckoutSessionId: "SE", paymentStatus: "paid", price: 20, paidAt: boundary, createdAt: boundary });
    // Hors des 12 derniers mois : ignoré
    const old = new Date("2025-05-20T10:00:00Z");
    await createCreation({ title: "Vieille", weight: 100, yarnPrice: 9, createdAt: old });
    await createReservation({ creationId: e._id, stripeCheckoutSessionId: "SO", paymentStatus: "paid", price: 99, paidAt: old, createdAt: old });
    asAdmin();

    const { body } = await readJson(await GET());
    const months = Object.fromEntries(body.monthlyData.map((m: any) => [m.month, m]));
    expect(months["juin 2026"]).toEqual({ month: "juin 2026", orders: 1, validated: 1, revenue: 20, cost: 2, profit: 18, sold: 1 });
    expect(months["mai 2026"]).toMatchObject({ orders: 0, revenue: 0, cost: 0 });
    expect(body.monthlyData.reduce((sum: number, m: any) => sum + m.revenue, 0)).toBe(20);
    expect(body.revenue.total).toBe(119);
  });

  it("répond 500 en cas d'erreur", async () => {
    failSession();
    const { status, body } = await readJson(await GET());
    expect(status).toBe(500);
    expect(body.error).toBe("Server error");
  });
});
