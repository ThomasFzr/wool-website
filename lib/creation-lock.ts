import type { Types } from "mongoose";
import Creation from "@/models/Creation";

type Id = Types.ObjectId | string;

/** Champs posés avec le verrou `reserved` d'une pièce unique. */
export const LOCK_FIELDS_UNSET = {
  reservedName: "",
  reservedContact: "",
  reservedMessage: "",
  reservedAt: "",
  reservedByReservationId: "",
} as const;

/**
 * Libère le verrou d'une pièce uniquement s'il appartient encore à la réservation
 * donnée : une réservation annulée ou expirée ne peut jamais rouvrir une pièce
 * verrouillée depuis par un autre acheteur. Renvoie true si le verrou a été levé.
 */
export async function releaseCreationLock(creationId: Id, reservationId: Id): Promise<boolean> {
  const result = await Creation.updateOne(
    {
      _id: creationId,
      sold: { $ne: true },
      reserved: true,
      reservedByReservationId: reservationId,
    },
    { $set: { reserved: false }, $unset: LOCK_FIELDS_UNSET }
  );
  return result.modifiedCount > 0;
}

/** Libère plusieurs verrous ; renvoie le nombre de pièces effectivement libérées. */
export async function releaseCreationLocks(
  locks: { creationId?: Id | null; reservationId: Id }[]
): Promise<number> {
  const released = await Promise.all(
    locks
      .filter((l) => l.creationId)
      .map((l) => releaseCreationLock(l.creationId!, l.reservationId))
  );
  return released.filter(Boolean).length;
}
