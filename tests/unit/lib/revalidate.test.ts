import { describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { revalidateCatalog, revalidateOrders } from "@/lib/revalidate";

describe("revalidateCatalog", () => {
  it("invalide la vitrine, l'API et toutes les fiches produit", () => {
    revalidateCatalog();
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      ["/"],
      ["/api/creations"],
      ["/creations/[id]", "page"],
    ]);
  });

  it("ne propage pas une erreur d'invalidation", () => {
    vi.mocked(revalidatePath).mockImplementationOnce(() => {
      throw new Error("hors requête");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => revalidateCatalog()).not.toThrow();
    expect(error).toHaveBeenCalled();
  });
});

describe("revalidateOrders", () => {
  it("invalide la liste des commandes", () => {
    revalidateOrders();
    expect(revalidatePath).toHaveBeenCalledWith("/account/orders");
  });

  it("ne propage pas une erreur d'invalidation", () => {
    vi.mocked(revalidatePath).mockImplementationOnce(() => {
      throw new Error("hors requête");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => revalidateOrders()).not.toThrow();
    expect(error).toHaveBeenCalled();
  });
});
