import mongoose from "mongoose";

/**
 * Erreur due aux données envoyées (validateur du schéma, valeur impossible à convertir) :
 * à renvoyer en 400 plutôt qu'en 500.
 */
export function isInvalidInput(err: unknown): boolean {
  return err instanceof mongoose.Error.ValidationError || err instanceof mongoose.Error.CastError;
}
