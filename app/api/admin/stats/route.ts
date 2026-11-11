import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import Creation from "@/models/Creation";
import { checkAdminAuth } from "@/lib/auth";

const DAY_MS = 24 * 3600 * 1000;
const TIMEZONE = "Europe/Paris";

// Mêmes commandes que la liste admin : paiements validés et commandes manuelles (sans Stripe).
// Les paniers abandonnés (session Stripe jamais payée) ne sont pas des commandes.
const ORDER_FILTER = {
  $or: [
    { paymentStatus: "paid" },
    { stripeCheckoutSessionId: { $exists: false } },
    { stripeCheckoutSessionId: null },
  ],
};

const STATUS_PRIORITY: Record<string, number> = {
  cancelled: 0,
  pending: 2,
  preparing: 2,
  shipped: 3,
  in_transit: 4,
  delivered: 5,
  validated: 6,
};

type CreationInfo = {
  _id: { toString(): string };
  title?: string;
  price?: number;
  imageUrl?: string;
  yarnPrice?: number | null;
  weight?: number | null;
};

type OrderReservation = {
  _id: { toString(): string };
  stripeCheckoutSessionId?: string | null;
  status?: string;
  paymentStatus?: string;
  price?: number | null;
  shippingCost?: number | null;
  paidAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  creationId?: CreationInfo | null;
};

const monthFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
});

/** Mois civil à Paris (« 2026-06 ») : une vente du 1er à 0 h 30 compte dans le bon mois. */
function monthKey(date: Date) {
  return monthFormatter.format(date).slice(0, 7);
}

/** Les 12 derniers mois civils à Paris, du plus ancien au mois courant. */
function lastTwelveMonths(now: Date) {
  const [year, month] = monthKey(now).split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    // Le 15 à midi UTC tombe dans le même mois à Paris : sert au libellé
    const d = new Date(Date.UTC(year, month - 1 - (11 - i), 15, 12));
    return {
      key: monthKey(d),
      label: d.toLocaleDateString("fr-FR", { month: "short", year: "numeric", timeZone: TIMEZONE }),
    };
  });
}

function groupIntoOrders<T extends OrderReservation>(reservations: T[]): Map<string, T[]> {
  const orders = new Map<string, T[]>();
  for (const r of reservations) {
    const key = r.stripeCheckoutSessionId || r._id.toString();
    const items = orders.get(key);
    if (items) items.push(r);
    else orders.set(key, [r]);
  }
  return orders;
}

const isSale = (r: OrderReservation) => r.paymentStatus === "paid" && r.status !== "cancelled";
const saleDate = (r: OrderReservation) => r.paidAt ?? r.updatedAt;
// Prix figé au moment de la commande ; les commandes antérieures n'en ont pas : prix actuel.
const salePrice = (r: OrderReservation) => r.price ?? r.creationId?.price ?? 0;
const unitCostOf = (c: CreationInfo | null | undefined) =>
  c?.weight && c.yarnPrice ? (c.weight / 100) * c.yarnPrice : 0;

export async function GET() {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await connectToDatabase();

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);
    const months = lastTwelveMonths(now);
    const monthKeys = new Set(months.map((m) => m.key));
    // Large borne basse pour les coûts : le filtre exact se fait par mois à Paris
    const costsSince = new Date(now.getTime() - 400 * DAY_MS);

    const [reservations, totalCreations, soldCreations, availableCreations, recentCreations] =
      await Promise.all([
        Reservation.find(ORDER_FILTER)
          .select("stripeCheckoutSessionId status paymentStatus price shippingCost paidAt createdAt updatedAt creationId")
          .populate("creationId", "title price imageUrl yarnPrice weight")
          .lean<OrderReservation[]>(),
        Creation.countDocuments(),
        Creation.countDocuments({ sold: true }),
        Creation.countDocuments({ sold: { $ne: true } }),
        Creation.find({ createdAt: { $gte: costsSince } })
          .select("createdAt weight yarnPrice")
          .lean<(CreationInfo & { createdAt: Date })[]>(),
      ]);

    const orders = [...groupIntoOrders(reservations).values()];

    // Statut d'une commande = statut le plus avancé de ses articles
    const ordersByStatus = { preparing: 0, validated: 0, cancelled: 0, shipped: 0, in_transit: 0, delivered: 0 };
    for (const items of orders) {
      const priority = (r: OrderReservation) => STATUS_PRIORITY[r.status ?? ""] || 0;
      const highest = [...items].sort((a, b) => priority(b) - priority(a))[0].status;
      if (highest === "pending" || highest === "preparing") ordersByStatus.preparing++;
      else if (highest && highest in ordersByStatus) ordersByStatus[highest as keyof typeof ordersByStatus]++;
    }

    const orderDate = (items: OrderReservation[]) =>
      new Date(Math.min(...items.map((r) => new Date(r.createdAt).getTime())));
    const orderSales = (items: OrderReservation[]) => items.filter(isSale);
    // Frais de port payés par la commande (portés par un seul article), gardés tant
    // qu'au moins un article n'est pas annulé
    const orderShipping = (items: OrderReservation[]) =>
      orderSales(items).length > 0
        ? items
            .filter((r) => r.paymentStatus === "paid")
            .reduce((sum, r) => sum + (r.shippingCost || 0), 0)
        : 0;
    const orderSaleDate = (items: OrderReservation[]) =>
      new Date(Math.max(...orderSales(items).map((r) => new Date(saleDate(r)).getTime())));

    const sales = reservations.filter(isSale);
    const salesRevenue = sales.reduce((sum, r) => sum + salePrice(r), 0);
    const shippingRevenue = orders.reduce((sum, items) => sum + orderShipping(items), 0);

    const since = (date: Date) => (d: Date) => new Date(d).getTime() >= date.getTime();
    const paidOrders = orders.filter((items) => orderSales(items).length > 0);
    const countOrdersSince = (date: Date) => orders.filter((items) => since(date)(orderDate(items))).length;
    const paidOrdersSince = (date: Date) => paidOrders.filter((items) => since(date)(orderSaleDate(items)));

    const paidLast30Days = paidOrdersSince(thirtyDaysAgo);
    const salesLast30Days = sales.filter((r) => since(thirtyDaysAgo)(saleDate(r)));
    const revenueLast30Days =
      salesLast30Days.reduce((sum, r) => sum + salePrice(r), 0) +
      paidLast30Days.reduce((sum, items) => sum + orderShipping(items), 0);

    // Détail par création vendue
    const byCreation = new Map<string, OrderReservation[]>();
    for (const r of sales) {
      const key = r.creationId?._id.toString() ?? "deleted";
      const list = byCreation.get(key);
      if (list) list.push(r);
      else byCreation.set(key, [r]);
    }
    const soldCreationsList = [...byCreation.entries()]
      .map(([id, items]) => {
        const creation = items[0].creationId;
        const unitCost = unitCostOf(creation);
        const totalRevenue = items.reduce((sum, r) => sum + salePrice(r), 0);
        const totalCost = unitCost * items.length;
        return {
          _id: id,
          title: creation?.title ?? "Création supprimée",
          price: creation?.price ?? 0,
          salesCount: items.length,
          totalRevenue,
          unitCost,
          totalCost,
          profit: totalRevenue - totalCost,
          imageUrl: creation?.imageUrl,
          lastSaleDate: new Date(Math.max(...items.map((r) => new Date(saleDate(r)).getTime()))),
        };
      })
      .sort((a, b) => b.lastSaleDate.getTime() - a.lastSaleDate.getTime());

    // Historique mensuel (mois civils à Paris)
    const monthly = new Map(
      months.map((m) => [m.key, { month: m.label, orders: 0, validated: 0, revenue: 0, cost: 0, profit: 0, sold: 0 }])
    );
    const bucket = (date: Date) => monthKeys.has(monthKey(date)) ? monthly.get(monthKey(date))! : null;
    for (const items of orders) {
      const m = bucket(orderDate(items));
      if (!m) continue;
      m.orders++;
      if (orderSales(items).length > 0) m.validated++;
    }
    for (const r of sales) {
      const m = bucket(new Date(saleDate(r)));
      if (!m) continue;
      m.sold++;
      m.revenue += salePrice(r);
    }
    for (const items of paidOrders) {
      const m = bucket(orderSaleDate(items));
      if (m) m.revenue += orderShipping(items);
    }
    // Coût de la laine des créations créées dans le mois
    for (const c of recentCreations) {
      const m = bucket(new Date(c.createdAt));
      if (m) m.cost += unitCostOf(c);
    }
    const monthlyData = [...monthly.values()].map((m) => ({ ...m, profit: m.revenue - m.cost }));

    return NextResponse.json({
      orders: {
        total: orders.length,
        ...ordersByStatus,
        last7Days: countOrdersSince(sevenDaysAgo),
        last30Days: countOrdersSince(thirtyDaysAgo),
        validatedLast7Days: paidOrdersSince(sevenDaysAgo).length,
        validatedLast30Days: paidLast30Days.length,
      },
      creations: {
        total: totalCreations,
        sold: soldCreations, // Nombre de créations actuellement vendues
        available: availableCreations,
      },
      revenue: {
        // Chiffre d'affaires : articles au prix payé + frais de port
        total: salesRevenue + shippingRevenue,
        // Prix moyen d'un article vendu (hors frais de port)
        average: sales.length > 0 ? salesRevenue / sales.length : 0,
        last30Days: revenueLast30Days,
        soldLast30Days: salesLast30Days.length,
        totalSales: sales.length,
        soldCreations: soldCreationsList,
      },
      monthlyData,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
