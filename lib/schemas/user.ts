import { z } from "zod";
import { email, password, text } from "@/lib/validation";
import { USER_ROLES } from "@/models/User";

/**
 * Compte créé ou modifié depuis l'admin (POST /api/admin/users, PATCH /api/admin/users/[id]).
 * Le formulaire envoie `null` pour un champ vidé. La politique de mot de passe (longueur,
 * fuites connues) est appliquée ensuite par la route (lib/password-policy).
 */
const userFields = {
  name: text(100).nullish(),
  role: z.enum(USER_ROLES, "Rôle invalide.").optional(),
  password: password.optional(),
  phone: text(30).nullish(),
  address: text(200).nullish(),
  city: text(100).nullish(),
  postalCode: text(10).nullish(),
  emailNotifications: z.boolean().optional(),
};

export const createUserSchema = z.object({ ...userFields, email });

export const updateUserSchema = z.object({ ...userFields, email: email.optional() });
