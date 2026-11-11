// Environnement node (pas de window) : rendu serveur du CartProvider
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { useSession } from "next-auth/react";
import { CartProvider, useCart } from "@/contexts/CartContext";

vi.mock("next-auth/react", () => ({ useSession: vi.fn() }));

describe("CartProvider — rendu serveur", () => {
  it("rend un panier vide et addItem ne plante pas sans window", () => {
    vi.mocked(useSession).mockReturnValue({ data: null, status: "loading" } as ReturnType<typeof useSession>);
    let cart!: ReturnType<typeof useCart>;
    function Probe() {
      cart = useCart();
      return <span>{cart.getTotalItems()} article(s)</span>;
    }

    const html = renderToString(
      <CartProvider>
        <Probe />
      </CartProvider>
    );

    expect(typeof window).toBe("undefined");
    expect(html).toContain("0");
    expect(cart.isOpen).toBe(false);
    expect(cart.deliveryMode).toBe("pickup");
    expect(() => cart.addItem({ creationId: "a1", title: "Bonnet" })).not.toThrow();
  });
});
