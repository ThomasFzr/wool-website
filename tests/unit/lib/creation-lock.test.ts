import { beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { releaseCreationLock, releaseCreationLocks } from "@/lib/creation-lock";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import { createCreation } from "../../helpers/stripe-fake";

const newId = () => new mongoose.Types.ObjectId();

describe("verrou des pièces uniques", () => {
  beforeEach(async () => {
    await connectToDatabase();
  });

  it("libère la pièce quand le verrou appartient à la réservation", async () => {
    const owner = newId();
    const c = await createCreation({ reserved: true, reservedContact: "a@example.com", reservedByReservationId: owner });

    expect(await releaseCreationLock(c._id, owner)).toBe(true);

    const doc = (await Creation.findById(c._id))!;
    expect(doc.reserved).toBe(false);
    expect(doc.reservedContact).toBeUndefined();
    expect(doc.reservedByReservationId).toBeUndefined();
  });

  it("ne touche pas au verrou d'une autre réservation", async () => {
    const c = await createCreation({ reserved: true, reservedByReservationId: newId() });
    expect(await releaseCreationLock(c._id, newId())).toBe(false);
    expect((await Creation.findById(c._id))!.reserved).toBe(true);
  });

  it("ne touche pas à un verrou sans détenteur (posé à la main ou avant l'introduction du détenteur)", async () => {
    const c = await createCreation({ reserved: true });
    expect(await releaseCreationLock(c._id, newId())).toBe(false);
    expect((await Creation.findById(c._id))!.reserved).toBe(true);
  });

  it("ne remet jamais en vente une pièce vendue", async () => {
    const owner = newId();
    const c = await createCreation({ sold: true, reserved: true, reservedByReservationId: owner });
    expect(await releaseCreationLock(c._id, owner)).toBe(false);
  });

  it("compte les pièces libérées et ignore les réservations sans pièce", async () => {
    const owner = newId();
    const mine = await createCreation({ reserved: true, reservedByReservationId: owner });
    const other = await createCreation({ reserved: true, reservedByReservationId: newId() });

    const count = await releaseCreationLocks([
      { creationId: mine._id, reservationId: owner },
      { creationId: other._id, reservationId: owner },
      { creationId: null, reservationId: owner },
    ]);

    expect(count).toBe(1);
  });
});
