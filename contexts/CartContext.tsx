"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type CartItem = {
  creationId: string;
  slug?: string;
  title: string;
  imageUrl?: string;
  price?: number;
  quantity: number;
};

export type DeliveryMode = "pickup" | "shipping";

type CartContextType = {
  items: CartItem[];
  isOpen: boolean;
  deliveryMode: DeliveryMode;
  shippingCost: number;
  openCart: () => void;
  closeCart: () => void;
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (creationId: string) => void;
  updateQuantity: (creationId: string, quantity: number) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
  getTotalWithShipping: () => number;
  setDeliveryMode: (mode: DeliveryMode) => void;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

const STORAGE_KEY = "wool-starter-cart";
const DELIVERY_MODE_KEY = "wool-starter-delivery-mode";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [deliveryMode, setDeliveryModeState] = useState<DeliveryMode>("pickup");
  const [shippingCost, setShippingCost] = useState(5);

  // Charger le panier et le mode de livraison depuis localStorage au montage
  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setItems(JSON.parse(stored));
      }
      const storedDeliveryMode = localStorage.getItem(DELIVERY_MODE_KEY);
      if (storedDeliveryMode === "pickup" || storedDeliveryMode === "shipping") {
        setDeliveryModeState(storedDeliveryMode);
      }
    } catch (error) {
      console.error("Erreur lors du chargement du panier:", error);
    }
  }, []);

  // Charger les frais de livraison depuis les settings
  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.shippingCost != null) {
          setShippingCost(data.shippingCost);
        }
      })
      .catch((err) => console.error("Erreur chargement settings:", err));
  }, []);

  // Sauvegarder le panier dans localStorage à chaque changement
  useEffect(() => {
    if (mounted) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      } catch (error) {
        console.error("Erreur lors de la sauvegarde du panier:", error);
      }
    }
  }, [items, mounted]);

  // Sauvegarder le mode de livraison
  useEffect(() => {
    if (mounted) {
      try {
        localStorage.setItem(DELIVERY_MODE_KEY, deliveryMode);
      } catch (error) {
        console.error("Erreur lors de la sauvegarde du mode de livraison:", error);
      }
    }
  }, [deliveryMode, mounted]);

  const setDeliveryMode = (mode: DeliveryMode) => {
    setDeliveryModeState(mode);
  };

  const openCart = () => setIsOpen(true);
  const closeCart = () => setIsOpen(false);

  const addItem = (newItem: Omit<CartItem, "quantity">) => {
    setItems((prevItems) => {
      const existingItem = prevItems.find(
        (item) => item.creationId === newItem.creationId
      );

      if (existingItem) {
        // Si l'article existe déjà, ne rien faire (un seul exemplaire par article)
        return prevItems;
      } else {
        // Sinon, ajouter l'article avec quantité 1
        return [...prevItems, { ...newItem, quantity: 1 }];
      }
    });
    // Ouvrir la modale après ajout (sur desktop)
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      setIsOpen(true);
    }
  };

  const removeItem = (creationId: string) => {
    setItems((prevItems) =>
      prevItems.filter((item) => item.creationId !== creationId)
    );
  };

  const updateQuantity = (creationId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(creationId);
      return;
    }

    setItems((prevItems) =>
      prevItems.map((item) =>
        item.creationId === creationId ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const getTotalItems = () => {
    return items.length;
  };

  const getTotalPrice = () => {
    return items.reduce((total, item) => {
      const itemPrice = item.price || 0;
      return total + itemPrice;
    }, 0);
  };

  const getTotalWithShipping = () => {
    const subtotal = getTotalPrice();
    if (deliveryMode === "shipping") {
      return subtotal + shippingCost;
    }
    return subtotal;
  };

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        deliveryMode,
        shippingCost,
        openCart,
        closeCart,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        getTotalItems,
        getTotalPrice,
        getTotalWithShipping,
        setDeliveryMode,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart doit être utilisé dans un CartProvider");
  }
  return context;
}
