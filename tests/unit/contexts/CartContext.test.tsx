// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useSession } from "next-auth/react";
import { CartProvider, useCart, type CartItem, type PickupConditions } from "@/contexts/CartContext";

vi.mock("next-auth/react", () => ({ useSession: vi.fn() }));

const STORAGE_KEY = "wool-starter-cart";
const DELIVERY_MODE_KEY = "wool-starter-delivery-mode";

const bonnet: CartItem = { creationId: "a1", slug: "bonnet", title: "Bonnet", price: 30 };
const echarpe: CartItem = { creationId: "b2", title: "Écharpe", price: 45 };
const mitaines: CartItem = { creationId: "c3", title: "Mitaines" };

// --- fetch simulé : /api/creations/availability et /api/account/profile ---
let availableIds: string[] | null = null; // null = tout est disponible
let availabilityBody: (() => unknown) | null = null;
let profileBody: unknown = {};
const fetchMock = vi.fn(async (url: string) => {
  if (url.startsWith("/api/creations/availability")) {
    const ids = new URL(url, "http://x").searchParams.get("ids")!.split(",");
    const body = availabilityBody ? availabilityBody() : { available: availableIds ?? ids };
    return { ok: true, json: async () => body } as Response;
  }
  if (url === "/api/account/profile") {
    return { ok: true, json: async () => profileBody } as Response;
  }
  throw new Error(`URL inattendue : ${url}`);
});

const availabilityCalls = () =>
  fetchMock.mock.calls.filter(([url]) => url.startsWith("/api/creations/availability"));
const profileCalls = () => fetchMock.mock.calls.filter(([url]) => url === "/api/account/profile");

function signedInAs(email: string | null) {
  vi.mocked(useSession).mockReturnValue(
    (email
      ? { data: { user: { email }, expires: "2999-01-01" }, status: "authenticated" }
      : { data: null, status: "unauthenticated" }) as ReturnType<typeof useSession>
  );
}

function renderCart(props: { shippingCost?: number; pickupConditions?: PickupConditions | null } = {}) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <CartProvider {...props}>{children}</CartProvider>
  );
  return renderHook(() => useCart(), { wrapper });
}

/** Laisse les effets et promesses en attente se résoudre */
const flush = () => act(async () => {});

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

function storeCart(items: CartItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

let now = 1_000_000;

beforeEach(() => {
  localStorage.clear();
  availableIds = null;
  availabilityBody = null;
  profileBody = {};
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  signedInAs(null);
  setVisibility("visible");
  now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useCart", () => {
  it("lève une erreur hors d'un CartProvider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useCart())).toThrow("useCart doit être utilisé dans un CartProvider");
  });
});

describe("CartProvider — persistance localStorage", () => {
  it("démarre vide en retrait sur place sans rien en stock", async () => {
    const { result } = renderCart();
    await flush();
    expect(result.current.items).toEqual([]);
    expect(result.current.deliveryMode).toBe("pickup");
    expect(result.current.isOpen).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("[]");
    expect(localStorage.getItem(DELIVERY_MODE_KEY)).toBe("pickup");
    // Panier vide : aucune vérification de disponibilité
    expect(availabilityCalls()).toHaveLength(0);
  });

  it("recharge le panier et le mode de livraison enregistrés", async () => {
    storeCart([bonnet, echarpe]);
    localStorage.setItem(DELIVERY_MODE_KEY, "shipping");
    const { result } = renderCart();
    await flush();
    expect(result.current.items).toEqual([bonnet, echarpe]);
    expect(result.current.deliveryMode).toBe("shipping");
  });

  it("ignore un mode de livraison enregistré inconnu", async () => {
    localStorage.setItem(DELIVERY_MODE_KEY, "drone");
    const { result } = renderCart();
    await flush();
    expect(result.current.deliveryMode).toBe("pickup");
    expect(localStorage.getItem(DELIVERY_MODE_KEY)).toBe("pickup");
  });

  it("survit à un panier enregistré corrompu", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEY, "{pas du json");
    const { result } = renderCart();
    await flush();
    expect(result.current.items).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith("Erreur lors du chargement du panier:", expect.any(SyntaxError));
    expect(localStorage.getItem(STORAGE_KEY)).toBe("[]");
  });

  it("enregistre chaque modification du panier et du mode de livraison", async () => {
    const { result } = renderCart();
    await flush();
    act(() => result.current.addItem(bonnet));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([bonnet]);
    act(() => result.current.setDeliveryMode("shipping"));
    expect(localStorage.getItem(DELIVERY_MODE_KEY)).toBe("shipping");
  });

  it("journalise sans planter quand le localStorage refuse l'écriture", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const { result } = renderCart();
    await flush();
    act(() => result.current.addItem(bonnet));
    expect(result.current.items).toEqual([bonnet]);
    expect(consoleError).toHaveBeenCalledWith("Erreur lors de la sauvegarde du panier:", expect.any(Error));
    expect(consoleError).toHaveBeenCalledWith(
      "Erreur lors de la sauvegarde du mode de livraison:",
      expect.any(Error)
    );
  });
});

describe("CartProvider — gestion des articles", () => {
  it("ajoute un article une seule fois et ouvre le panier sur desktop", async () => {
    const { result } = renderCart();
    await flush();
    act(() => result.current.addItem(bonnet));
    act(() => result.current.addItem({ ...bonnet, title: "Doublon" }));
    expect(result.current.items).toEqual([bonnet]);
    expect(result.current.isOpen).toBe(true);
  });

  it("n'ouvre pas le panier sur mobile", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    const { result } = renderCart();
    await flush();
    act(() => result.current.addItem(bonnet));
    expect(result.current.isOpen).toBe(false);
  });

  it("n'ouvre pas le panier quand on est déjà sur la page /cart", async () => {
    window.history.pushState({}, "", "/cart");
    const { result } = renderCart();
    await flush();
    act(() => result.current.addItem(bonnet));
    expect(result.current.items).toEqual([bonnet]);
    expect(result.current.isOpen).toBe(false);
  });

  it("retire un article et vide le panier", async () => {
    storeCart([bonnet, echarpe, mitaines]);
    const { result } = renderCart();
    await flush();
    act(() => result.current.removeItem("b2"));
    expect(result.current.items).toEqual([bonnet, mitaines]);
    act(() => result.current.clearCart());
    expect(result.current.items).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("[]");
  });

  it("ferme le panier", async () => {
    const { result } = renderCart();
    await flush();
    act(() => result.current.openCart());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.closeCart());
    expect(result.current.isOpen).toBe(false);
  });
});

describe("CartProvider — totaux et frais de port", () => {
  it("compte les articles et additionne les prix (prix absent = 0)", async () => {
    storeCart([bonnet, echarpe, mitaines]);
    const { result } = renderCart();
    await flush();
    expect(result.current.getTotalItems()).toBe(3);
    expect(result.current.getTotalPrice()).toBe(75);
  });

  it("n'ajoute pas de frais de port en retrait sur place", async () => {
    storeCart([bonnet]);
    const { result } = renderCart({ shippingCost: 8 });
    await flush();
    expect(result.current.deliveryMode).toBe("pickup");
    expect(result.current.getTotalWithShipping()).toBe(30);
  });

  it("ajoute les frais de port configurés en livraison", async () => {
    storeCart([bonnet]);
    const { result } = renderCart({ shippingCost: 8 });
    await flush();
    act(() => result.current.setDeliveryMode("shipping"));
    expect(result.current.shippingCost).toBe(8);
    expect(result.current.getTotalWithShipping()).toBe(38);
  });

  it("utilise 5 € de frais de port par défaut", async () => {
    storeCart([bonnet]);
    localStorage.setItem(DELIVERY_MODE_KEY, "shipping");
    const { result } = renderCart();
    await flush();
    expect(result.current.shippingCost).toBe(5);
    expect(result.current.getTotalWithShipping()).toBe(35);
  });
});

describe("CartProvider — disponibilité des articles", () => {
  it("vérifie la disponibilité au chargement et retire un article vendu", async () => {
    storeCart([bonnet, echarpe]);
    availableIds = ["b2"];
    const { result } = renderCart();
    await waitFor(() => expect(result.current.items).toEqual([echarpe]));
    expect(availabilityCalls()[0][0]).toBe("/api/creations/availability?ids=a1,b2");
    expect(result.current.unavailableNotice).toBe(
      "« Bonnet » n'est plus disponible et a été retiré de votre panier."
    );
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([echarpe]);

    act(() => result.current.dismissUnavailableNotice());
    expect(result.current.unavailableNotice).toBeNull();
  });

  it("liste tous les articles retirés quand plusieurs sont vendus", async () => {
    storeCart([bonnet, echarpe, mitaines]);
    availableIds = ["b2"];
    const { result } = renderCart();
    await waitFor(() => expect(result.current.items).toEqual([echarpe]));
    expect(result.current.unavailableNotice).toBe(
      "2 articles ne sont plus disponibles et ont été retirés de votre panier : « Bonnet », « Mitaines »."
    );
  });

  it("ne touche à rien quand tout est disponible", async () => {
    storeCart([bonnet, echarpe]);
    const { result } = renderCart();
    await flush();
    expect(availabilityCalls()).toHaveLength(1);
    expect(result.current.items).toEqual([bonnet, echarpe]);
    expect(result.current.unavailableNotice).toBeNull();
  });

  it.each([
    ["available: null (vérification impossible)", () => ({ available: null })],
    ["corps null", () => null],
  ])("ne purge rien quand la réponse est inexploitable : %s", async (_label, body) => {
    storeCart([bonnet]);
    availabilityBody = body;
    const { result } = renderCart();
    await flush();
    expect(availabilityCalls()).toHaveLength(1);
    expect(result.current.items).toEqual([bonnet]);
    expect(result.current.unavailableNotice).toBeNull();
  });

  it("ne purge rien et journalise si la requête échoue", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    storeCart([bonnet]);
    availabilityBody = () => {
      throw new Error("réseau");
    };
    const { result } = renderCart();
    await flush();
    expect(result.current.items).toEqual([bonnet]);
    expect(consoleError).toHaveBeenCalledWith("Erreur lors de la vérification du panier:", expect.any(Error));
  });

  it("revérifie à l'ouverture du panier, même juste après une vérification", async () => {
    storeCart([bonnet]);
    const { result } = renderCart();
    await flush();
    expect(availabilityCalls()).toHaveLength(1);

    availableIds = [];
    act(() => result.current.openCart());
    await waitFor(() => expect(result.current.items).toEqual([]));
    expect(availabilityCalls()).toHaveLength(2);
    expect(result.current.isOpen).toBe(true);
  });

  it("revérifie à la demande via refreshAvailability", async () => {
    storeCart([bonnet]);
    const { result } = renderCart();
    await flush();
    availableIds = [];
    await act(async () => {
      await result.current.refreshAvailability();
    });
    expect(result.current.items).toEqual([]);
  });

  it("revérifie au retour sur l'onglet, au plus une fois toutes les 30 s", async () => {
    storeCart([bonnet]);
    const { result } = renderCart();
    await flush();
    expect(availabilityCalls()).toHaveLength(1);

    // Retour immédiat : étranglé
    now += 10_000;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(availabilityCalls()).toHaveLength(1);

    // Plus de 30 s après : nouvelle vérification, l'article a été vendu entre-temps
    availableIds = [];
    now += 25_000;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(availabilityCalls()).toHaveLength(2);
    expect(result.current.items).toEqual([]);
    expect(result.current.unavailableNotice).toContain("« Bonnet »");
  });

  it("le focus de la fenêtre déclenche aussi la revérification, sans doublon avec visibilitychange", async () => {
    storeCart([bonnet]);
    renderCart();
    await flush();
    now += 31_000;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(availabilityCalls()).toHaveLength(2);
  });

  it("ne revérifie pas quand l'onglet devient caché", async () => {
    storeCart([bonnet]);
    renderCart();
    await flush();
    now += 60_000;
    setVisibility("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(availabilityCalls()).toHaveLength(1);
  });

  it("n'écoute plus l'onglet après démontage", async () => {
    storeCart([bonnet]);
    const { unmount } = renderCart();
    await flush();
    unmount();
    now += 60_000;
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    expect(availabilityCalls()).toHaveLength(1);
  });

  it("retire aussi un article ajouté pendant une vérification en cours", async () => {
    // BUG: la purge filtre l'état courant (prev) avec la liste des ids disponibles
    // calculée AVANT l'ajout : un article ajouté pendant la requête est retiré
    // silencieusement (il n'apparaît pas dans le message).
    storeCart([bonnet]);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    fetchMock.mockImplementationOnce(async () => {
      await gate;
      return { ok: true, json: async () => ({ available: [] }) } as Response;
    });
    const { result } = renderCart();
    await flush();
    act(() => result.current.addItem(echarpe));
    expect(result.current.items).toEqual([bonnet, echarpe]);

    await act(async () => {
      release();
    });
    await waitFor(() => expect(result.current.items).toEqual([]));
    expect(result.current.unavailableNotice).toBe(
      "« Bonnet » n'est plus disponible et a été retiré de votre panier."
    );
  });
});

describe("CartProvider — code postal de l'utilisateur", () => {
  const restricted: PickupConditions = {
    enabled: true,
    minimumAmount: 0,
    allowedPostalCodes: ["75"],
    message: "",
  };

  it("ne charge pas le profil pour un visiteur anonyme", async () => {
    renderCart({ pickupConditions: restricted });
    await flush();
    expect(profileCalls()).toHaveLength(0);
  });

  it("ne charge pas le profil quand la session n'a pas d'email", async () => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: {}, expires: "2999-01-01" },
      status: "authenticated",
    } as ReturnType<typeof useSession>);
    renderCart();
    await flush();
    expect(profileCalls()).toHaveLength(0);
  });

  it("charge le profil d'un utilisateur connecté et rend le retrait disponible", async () => {
    signedInAs("client@example.com");
    profileBody = { postalCode: "75011" };
    const { result } = renderCart({ pickupConditions: restricted });
    await waitFor(() => expect(result.current.isPickupAvailable).toBe(true));
    expect(result.current.pickupUnavailableReason).toBeNull();
    expect(profileCalls()).toHaveLength(1);
  });

  it("considère le code postal absent quand le profil n'en a pas", async () => {
    signedInAs("client@example.com");
    profileBody = { postalCode: "" };
    const { result } = renderCart({ pickupConditions: restricted });
    await flush();
    expect(profileCalls()).toHaveLength(1);
    expect(result.current.isPickupAvailable).toBe(false);
    expect(result.current.pickupUnavailableReason).toBe(
      "Veuillez renseigner votre code postal dans votre profil pour utiliser la remise en main propre"
    );
  });

  it("considère le code postal absent si le profil ne se charge pas", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    signedInAs("client@example.com");
    fetchMock.mockImplementationOnce(async () => {
      throw new Error("réseau");
    });
    const { result } = renderCart({ pickupConditions: restricted });
    await flush();
    expect(consoleError).toHaveBeenCalledWith("Erreur chargement profil:", expect.any(Error));
    expect(result.current.isPickupAvailable).toBe(false);
  });

  it("recharge le code postal au retour sur l'onglet (retour depuis la page profil)", async () => {
    signedInAs("client@example.com");
    profileBody = {};
    const { result } = renderCart({ pickupConditions: restricted });
    await flush();
    expect(result.current.isPickupAvailable).toBe(false);

    profileBody = { postalCode: "75002" };
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(profileCalls()).toHaveLength(2);
    expect(result.current.isPickupAvailable).toBe(true);
  });

  it("recharge le code postal au focus, mais pas quand l'onglet est caché", async () => {
    signedInAs("client@example.com");
    renderCart({ pickupConditions: restricted });
    await flush();
    expect(profileCalls()).toHaveLength(1);

    setVisibility("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(profileCalls()).toHaveLength(1);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(profileCalls()).toHaveLength(2);
  });

  it("n'écoute plus le profil après démontage", async () => {
    signedInAs("client@example.com");
    const { unmount } = renderCart({ pickupConditions: restricted });
    await flush();
    unmount();
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    expect(profileCalls()).toHaveLength(1);
  });

  it.each([
    ["sans conditions", null],
    ["sans liste de codes", { enabled: true, minimumAmount: 0, message: "" } as unknown as PickupConditions],
    ["avec une liste vide", { ...restricted, allowedPostalCodes: [] }],
  ])("ne recharge pas le profil au retour sur l'onglet %s", async (_label, conditions) => {
    signedInAs("client@example.com");
    renderCart({ pickupConditions: conditions });
    await flush();
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(profileCalls()).toHaveLength(1);
  });

  it("reloadPostalCode recharge le profil à la demande", async () => {
    signedInAs("client@example.com");
    const { result } = renderCart();
    await flush();
    await act(async () => {
      await result.current.reloadPostalCode();
    });
    expect(profileCalls()).toHaveLength(2);
  });
});

describe("CartProvider — remise en main propre", () => {
  const base: PickupConditions = { enabled: true, minimumAmount: 0, allowedPostalCodes: [], message: "" };

  async function pickupState(
    conditions: PickupConditions | null,
    opts: { items?: CartItem[]; email?: string | null; postalCode?: string } = {}
  ) {
    storeCart(opts.items ?? [bonnet]);
    signedInAs(opts.email === undefined ? "client@example.com" : opts.email);
    profileBody = opts.postalCode === undefined ? {} : { postalCode: opts.postalCode };
    const hook = renderCart({ pickupConditions: conditions });
    await flush();
    return hook.result;
  }

  it("est disponible sans conditions configurées", async () => {
    const result = await pickupState(null);
    expect(result.current.pickupConditions).toBeNull();
    expect(result.current.isPickupAvailable).toBe(true);
    expect(result.current.pickupUnavailableReason).toBeNull();
  });

  it("est disponible quand les conditions sont désactivées", async () => {
    const result = await pickupState({ ...base, enabled: false, minimumAmount: 1000 });
    expect(result.current.isPickupAvailable).toBe(true);
  });

  it("est indisponible sous le montant minimum et bascule en livraison", async () => {
    const result = await pickupState({ ...base, minimumAmount: 50 });
    expect(result.current.isPickupAvailable).toBe(false);
    expect(result.current.pickupUnavailableReason).toBe(
      "Montant minimum de 50.00 € requis pour la remise en main propre"
    );
    expect(result.current.deliveryMode).toBe("shipping");
    expect(localStorage.getItem(DELIVERY_MODE_KEY)).toBe("shipping");
  });

  it("est disponible dès que le montant minimum est atteint", async () => {
    const result = await pickupState({ ...base, minimumAmount: 50 }, { items: [bonnet, echarpe] });
    expect(result.current.isPickupAvailable).toBe(true);
    expect(result.current.deliveryMode).toBe("pickup");
  });

  it("ignore une liste de codes postaux absente", async () => {
    const result = await pickupState({ enabled: true, minimumAmount: 0, message: "" } as unknown as PickupConditions);
    expect(result.current.isPickupAvailable).toBe(true);
  });

  it("demande un code postal à un visiteur anonyme", async () => {
    const result = await pickupState({ ...base, allowedPostalCodes: ["75"] }, { email: null });
    expect(result.current.isPickupAvailable).toBe(false);
    expect(result.current.pickupUnavailableReason).toContain("Veuillez renseigner votre code postal");
  });

  it.each([
    ["correspondance exacte", ["75011"], "75011"],
    ["préfixe autorisé", [" 75 "], "75011"],
    ["insensible à la casse et aux espaces (codes étrangers)", ["sw1a"], " SW1A 1AA"],
    ["code utilisateur préfixe du code autorisé", ["75011"], "750"],
  ])("est disponible : %s", async (_label, allowed, postalCode) => {
    const result = await pickupState({ ...base, allowedPostalCodes: allowed }, { postalCode });
    expect(result.current.isPickupAvailable).toBe(true);
  });

  it("est indisponible pour un code postal non autorisé", async () => {
    const result = await pickupState({ ...base, allowedPostalCodes: ["75", "92"] }, { postalCode: "69001" });
    expect(result.current.isPickupAvailable).toBe(false);
    expect(result.current.pickupUnavailableReason).toBe(
      "La remise en main propre n'est pas disponible pour le code postal 69001. Codes autorisés : 75, 92"
    );
  });

  it("accepte un code postal très court ou blanc comme préfixe de n'importe quel code autorisé", async () => {
    // BUG: la correspondance « inverse » (allowedCode.startsWith(userCode)) accepte un
    // code postal partiel : « 7 » ou « 9 » ouvre le retrait à tout le département, et un
    // code composé d'espaces (normalisé en "") ouvre le retrait partout.
    const r1 = await pickupState({ ...base, allowedPostalCodes: ["75011"] }, { postalCode: "7" });
    expect(r1.current.isPickupAvailable).toBe(true);
  });

  it("accepte un code postal composé uniquement d'espaces", async () => {
    // BUG: voir ci-dessus — "   " est vrai (non vide) puis normalisé en "".
    const result = await pickupState({ ...base, allowedPostalCodes: ["75011"] }, { postalCode: "   " });
    expect(result.current.isPickupAvailable).toBe(true);
  });

  it("bascule en livraison au chargement avant même de connaître le code postal", async () => {
    // BUG: tant que le profil n'est pas chargé, userPostalCode vaut null donc le retrait est
    // jugé indisponible et le mode bascule (définitivement) en livraison, puis est enregistré.
    // Un utilisateur au code postal autorisé qui avait choisi le retrait le perd à chaque visite.
    localStorage.setItem(DELIVERY_MODE_KEY, "pickup");
    const result = await pickupState({ ...base, allowedPostalCodes: ["75"] }, { postalCode: "75011" });
    expect(result.current.isPickupAvailable).toBe(true);
    expect(result.current.deliveryMode).toBe("shipping");
    expect(localStorage.getItem(DELIVERY_MODE_KEY)).toBe("shipping");
  });

  it("laisse le mode livraison inchangé quand le retrait devient indisponible", async () => {
    localStorage.setItem(DELIVERY_MODE_KEY, "shipping");
    const result = await pickupState({ ...base, minimumAmount: 50 });
    expect(result.current.deliveryMode).toBe("shipping");
  });
});
