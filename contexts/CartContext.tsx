"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from "react";
import { useSession } from "next-auth/react";

export type CartItem = {
  creationId: string;
  slug?: string;
  title: string;
  imageUrl?: string;
  price?: number;
};

export type DeliveryMode = "pickup" | "shipping";

export type PickupConditions = {
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
  /** Message à afficher quand des articles ont été retirés du panier car plus disponibles */
  unavailableNotice: string | null;
  dismissUnavailableNotice: () => void;
  /** Revérifie la disponibilité des articles du panier et retire ceux qui ne le sont plus */
  refreshAvailability: () => void;
  openCart: () => void;
  closeCart: () => void;
  addItem: (item: CartItem) => void;
  removeItem: (creationId: string) => void;
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

// Les événements focus/visibilitychange se déclenchent à chaque alt-tab : on
// étrangle les vérifications automatiques de disponibilité à une par 30 s.
// Les vérifications explicites (ouverture du panier, refus au paiement) ne sont
// jamais étranglées.
const AUTO_CHECK_MIN_INTERVAL_MS = 30_000;

type CartProviderProps = {
  children: ReactNode;
  shippingCost?: number;
  pickupConditions?: PickupConditions | null;
};

export function CartProvider({ children, shippingCost = 5, pickupConditions = null }: CartProviderProps) {
  const { data: session, status: sessionStatus } = useSession();
  const userEmail = session?.user?.email ?? null;
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [deliveryMode, setDeliveryModeState] = useState<DeliveryMode>("pickup");
  const [userPostalCode, setUserPostalCode] = useState<string | null>(null);
  // Compte (email, ou null pour un visiteur) dont le code postal a été chargé ; undefined
  // tant que rien n'est chargé. Sert à ne pas juger le retrait sur un profil pas encore lu.
  const [postalCodeLoadedFor, setPostalCodeLoadedFor] = useState<string | null | undefined>(undefined);
  const [unavailableNotice, setUnavailableNotice] = useState<string | null>(null);

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

  // Référence toujours à jour sur les articles, pour que refreshAvailability
  // n'ait pas besoin d'être recréé à chaque changement de panier.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Horodatage de la dernière vérification de disponibilité (pour l'étranglement)
  const lastAutoCheckRef = useRef(0);

  /**
   * Purge les articles devenus indisponibles (vendus par quelqu'un d'autre,
   * cachés ou supprimés du catalogue) et prévient l'utilisateur.
   * Le panier vit dans le localStorage : il peut contenir un article acheté
   * entre-temps par un autre client.
   */
  const refreshAvailability = useCallback(async () => {
    const current = itemsRef.current;
    if (current.length === 0) return;

    // Toute vérification (explicite ou automatique) réarme la fenêtre
    // d'étranglement : pas de double requête si un focus suit de peu.
    lastAutoCheckRef.current = Date.now();

    try {
      const ids = current.map((item) => item.creationId).join(",");
      const res = await fetch(`/api/creations/availability?ids=${ids}`);
      const data = await res.json();

      // available === null : vérification impossible, on ne purge rien
      if (!Array.isArray(data?.available)) return;

      const available = new Set<string>(data.available);
      const removed = current.filter((item) => !available.has(item.creationId));
      if (removed.length === 0) return;

      setItems((prev) => prev.filter((item) => available.has(item.creationId)));
      setUnavailableNotice(
        removed.length === 1
          ? `« ${removed[0].title} » n'est plus disponible et a été retiré de votre panier.`
          : `${removed.length} articles ne sont plus disponibles et ont été retirés de votre panier : ${removed
              .map((item) => `« ${item.title} »`)
              .join(", ")}.`
      );
    } catch (error) {
      console.error("Erreur lors de la vérification du panier:", error);
    }
  }, []);

  const dismissUnavailableNotice = useCallback(() => setUnavailableNotice(null), []);

  // Vérification au chargement de l'application
  useEffect(() => {
    if (mounted) refreshAvailability();
  }, [mounted, refreshAvailability]);

  // Revérifier quand l'utilisateur revient sur l'onglet : un panier laissé
  // ouvert longtemps peut contenir un article acheté entre-temps.
  useEffect(() => {
    if (!mounted) return;

    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastAutoCheckRef.current < AUTO_CHECK_MIN_INTERVAL_MS) return;
      lastAutoCheckRef.current = now;
      refreshAvailability();
    };

    document.addEventListener("visibilitychange", maybeRefresh);
    window.addEventListener("focus", maybeRefresh);

    return () => {
      document.removeEventListener("visibilitychange", maybeRefresh);
      window.removeEventListener("focus", maybeRefresh);
    };
  }, [mounted, refreshAvailability]);

  // Fonction pour charger le code postal
  const loadUserPostalCode = useCallback(async () => {
    if (userEmail) {
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
    setPostalCodeLoadedFor(userEmail);
  }, [userEmail]);

  // Charger le code postal de l'utilisateur connecté
  useEffect(() => {
    loadUserPostalCode();
  }, [loadUserPostalCode]);

  // Recharger le code postal quand la page devient visible (après retour depuis profil)
  // Uniquement utile si des codes postaux conditionnent la remise en main propre
  const hasPostalCodeRestriction = (pickupConditions?.allowedPostalCodes?.length ?? 0) > 0;

  useEffect(() => {
    if (!mounted || !userEmail || !hasPostalCodeRestriction) return;

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
  }, [mounted, userEmail, hasPostalCodeRestriction, loadUserPostalCode]);

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

  const setDeliveryMode = useCallback((mode: DeliveryMode) => {
    setDeliveryModeState(mode);
  }, []);

  // Ouvrir le panier revérifie la disponibilité : un article vendu entre-temps
  // par un autre client disparaît avant que l'utilisateur ne tente de payer.
  const openCart = useCallback(() => {
    setIsOpen(true);
    refreshAvailability();
  }, [refreshAvailability]);

  const closeCart = useCallback(() => setIsOpen(false), []);

  const addItem = useCallback((newItem: CartItem) => {
    setItems((prevItems) => {
      const existingItem = prevItems.find(
        (item) => item.creationId === newItem.creationId
      );

      if (existingItem) {
        // Si l'article existe déjà, ne rien faire (un seul exemplaire par article)
        return prevItems;
      } else {
        // Sinon, ajouter l'article
        return [...prevItems, newItem];
      }
    });
    // Ouvrir la modale après ajout (sur desktop) sauf si on est déjà sur la page panier
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      const isOnCartPage = window.location.pathname === "/cart";
      if (!isOnCartPage) {
        setIsOpen(true);
      }
    }
  }, []);

  const removeItem = useCallback((creationId: string) => {
    setItems((prevItems) =>
      prevItems.filter((item) => item.creationId !== creationId)
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  // Valeurs dérivées mémoïsées
  const totalPrice = useMemo(
    () => items.reduce((total, item) => total + (item.price || 0), 0),
    [items]
  );

  const getTotalItems = useCallback(() => items.length, [items]);

  const getTotalPrice = useCallback(() => totalPrice, [totalPrice]);

  const getTotalWithShipping = useCallback(() => {
    if (deliveryMode === "shipping") {
      return totalPrice + shippingCost;
    }
    return totalPrice;
  }, [totalPrice, deliveryMode, shippingCost]);

  // Vérifier si la remise en main propre est disponible
  const { available: isPickupAvailable, reason: pickupUnavailableReason } = useMemo((): {
    available: boolean;
    reason: string | null;
  } => {
    if (!pickupConditions || !pickupConditions.enabled) {
      return { available: true, reason: null };
    }

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
      if (!userEmail || !userPostalCode) {
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
  }, [pickupConditions, totalPrice, userEmail, userPostalCode]);

  // Si le mode pickup est sélectionné mais n'est plus disponible, basculer vers shipping.
  // Pas avant de connaître la session et le code postal du compte : au premier rendu, le
  // retrait paraît indisponible faute de code postal et le choix serait perdu à chaque visite.
  const pickupStateKnown = sessionStatus !== "loading" && postalCodeLoadedFor === userEmail;
  useEffect(() => {
    if (deliveryMode === "pickup" && !isPickupAvailable && mounted && pickupStateKnown) {
      setDeliveryModeState("shipping");
    }
  }, [isPickupAvailable, deliveryMode, mounted, pickupStateKnown]);

  const value = useMemo<CartContextType>(
    () => ({
      items,
      isOpen,
      deliveryMode,
      shippingCost,
      pickupConditions,
      isPickupAvailable,
      pickupUnavailableReason,
      unavailableNotice,
      dismissUnavailableNotice,
      refreshAvailability,
      openCart,
      closeCart,
      addItem,
      removeItem,
      clearCart,
      getTotalItems,
      getTotalPrice,
      getTotalWithShipping,
      setDeliveryMode,
      reloadPostalCode: loadUserPostalCode,
    }),
    [
      items,
      isOpen,
      deliveryMode,
      shippingCost,
      pickupConditions,
      isPickupAvailable,
      pickupUnavailableReason,
      unavailableNotice,
      dismissUnavailableNotice,
      refreshAvailability,
      openCart,
      closeCart,
      addItem,
      removeItem,
      clearCart,
      getTotalItems,
      getTotalPrice,
      getTotalWithShipping,
      setDeliveryMode,
      loadUserPostalCode,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart doit être utilisé dans un CartProvider");
  }
  return context;
}
