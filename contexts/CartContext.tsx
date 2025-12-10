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

type CartContextType = {
  items: CartItem[];
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (creationId: string) => void;
  updateQuantity: (creationId: string, quantity: number) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

const STORAGE_KEY = "wool-starter-cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Charger le panier depuis localStorage au montage
  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setItems(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Erreur lors du chargement du panier:", error);
    }
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

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        openCart,
        closeCart,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        getTotalItems,
        getTotalPrice,
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
