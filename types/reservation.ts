export type Reservation = {
  _id: string;
  name: string;
  contact: string;
  message?: string;
  status: "pending" | "preparing" | "shipped" | "in_transit" | "delivered" | "validated" | "cancelled";
  createdAt: string;
  cancelReason?: string;
  cancelledBy?: "admin" | "user";
  deliveryMode?: "pickup" | "shipping";
  shippingCost?: number;
  trackingNumber?: string;
  shippedAt?: string;
  stripeCheckoutSessionId?: string;
  paidAt?: string;
  shippingAddress?: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    postalCode: string;
    country: string;
  };
  creationId?: {
    _id: string;
    title: string;
    images?: string[];
    imageUrl?: string;
    price?: number;
    color?: string;
    description?: string;
  } | null;
};
