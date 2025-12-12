"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useSession } from "next-auth/react";

export type CartItem = {
  creationId: string;
  slug?: string;
  title: string;
  imageUrl?: string;
  price?: number;
  quantity: number;
};

export type DeliveryMode = "pickup" | "shipping";

type PickupConditions = {
  enabled: boolean;
  minimumAmount: number;
  allowedPostalCodes: string[];
  message: string;
};

type CartContextType = {
  items: CartItem[];
  isOpen: boolean;
  deliveryMode: DeliveryMode;
  shippingCost: number;
  pickupConditions: PickupConditions | null;
  isPickupAvailable: boolean;
  pickupUnavailableReason: string | null;
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
  reloadPostalCode: () => void;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

const STORAGE_KEY = "wool-starter-cart";
const DELIVERY_MODE_KEY = "wool-starter-delivery-mode";

export function CartProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [deliveryMode, setDeliveryModeState] = useState<DeliveryMode>("pickup");
  const [shippingCost, setShippingCost] = useState(5);
  const [pickupConditions, setPickupConditions] = useState<PickupConditions | null>(null);
  const [userPostalCode, setUserPostalCode] = useState<string | null>(null);

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

  // Charger les frais de livraison et les conditions depuis les settings
  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.shippingCost != null) {
          setShippingCost(data.shippingCost);
        }
        if (data.pickupConditions) {
          setPickupConditions({
            enabled: data.pickupConditions.enabled ?? false,
            minimumAmount: data.pickupConditions.minimumAmount ?? 0,
            allowedPostalCodes: data.pickupConditions.allowedPostalCodes ?? [],
            message: data.pickupConditions.message ?? "",
          });
        }
      })
      .catch((err) => console.error("Erreur chargement settings:", err));
  }, []);

  // Fonction pour charger le code postal
  const loadUserPostalCode = useCallback(async () => {
    if (session?.user) {
      try {
        const res = await fetch("/api/account/profile");
        const data = await res.json();
        if (data.postalCode) {
          setUserPostalCode(data.postalCode);
        } else {
          setUserPostalCode(null);
        }
      } catch (err) {
        console.error("Erreur chargement profil:", err);
        setUserPostalCode(null);
      }
    } else {
      setUserPostalCode(null);
    }
  }, [session]);

  // Charger le code postal de l'utilisateur connecté
  useEffect(() => {
    loadUserPostalCode();
  }, [loadUserPostalCode]);

  // Recharger le code postal quand la page devient visible (après retour depuis profil)
  useEffect(() => {
    if (!mounted || !session?.user) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadUserPostalCode();
      }
    };

    const handleFocus = () => {
      loadUserPostalCode();
    };

    // Écouter les changements de visibilité de la page
    document.addEventListener("visibilitychange", handleVisibilityChange);
    // Écouter quand la fenêtre reprend le focus
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [mounted, session, loadUserPostalCode]);

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

  // Vérifier si la remise en main propre est disponible
  const checkPickupAvailability = (): { available: boolean; reason: string | null } => {
    if (!pickupConditions || !pickupConditions.enabled) {
      return { available: true, reason: null };
    }

    const totalPrice = getTotalPrice();

    // Vérifier le montant minimum
    if (pickupConditions.minimumAmount > 0 && totalPrice < pickupConditions.minimumAmount) {
      return {
        available: false,
        reason: `Montant minimum de ${pickupConditions.minimumAmount.toFixed(2)} € requis pour la remise en main propre`,
      };
    }

    // Vérifier les codes postaux autorisés
    if (pickupConditions.allowedPostalCodes && pickupConditions.allowedPostalCodes.length > 0) {
      // Si l'utilisateur n'est pas connecté ou n'a pas de code postal, on ne peut pas vérifier
      // On considère que c'est disponible mais on affichera un message
      if (!session?.user || !userPostalCode) {
        return {
          available: false,
          reason: "Veuillez renseigner votre code postal dans votre profil pour utiliser la remise en main propre",
        };
      }

      // Normaliser le code postal (enlever les espaces, mettre en majuscules)
      const normalizedUserCode = userPostalCode.trim().toUpperCase();
      const normalizedAllowedCodes = pickupConditions.allowedPostalCodes.map(code => code.trim().toUpperCase());

      // Vérifier si le code postal correspond (support des codes partiels, ex: 75 pour 75001, 75002, etc.)
      const isAllowed = normalizedAllowedCodes.some(allowedCode => {
        // Correspondance exacte
        if (normalizedUserCode === allowedCode) return true;
        // Correspondance partielle (si le code autorisé est un préfixe)
        if (normalizedUserCode.startsWith(allowedCode)) return true;
        // Correspondance partielle inverse (si le code de l'utilisateur est un préfixe du code autorisé)
        if (allowedCode.startsWith(normalizedUserCode)) return true;
        return false;
      });

      if (!isAllowed) {
        return {
          available: false,
          reason: `La remise en main propre n'est pas disponible pour le code postal ${userPostalCode}. Codes autorisés : ${pickupConditions.allowedPostalCodes.join(", ")}`,
        };
      }
    }

    return { available: true, reason: null };
  };

  const { available: isPickupAvailable, reason: pickupUnavailableReason } = checkPickupAvailability();

  // Si le mode pickup est sélectionné mais n'est plus disponible, basculer vers shipping
  useEffect(() => {
    if (deliveryMode === "pickup" && !isPickupAvailable && mounted) {
      setDeliveryModeState("shipping");
    }
  }, [isPickupAvailable, deliveryMode, mounted]);

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        deliveryMode,
        shippingCost,
        pickupConditions,
        isPickupAvailable,
        pickupUnavailableReason,
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
        reloadPostalCode: loadUserPostalCode,
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
