import mongoose, { Schema, model, models, type Document, type Model } from "mongoose";

//
// 1) Interface TypeScript pour l'utilisateur
//
export interface IUser {
  name?: string | null;
  email: string;
  provider: string;
  password?: string | null;
  role: "user" | "admin";
  resetToken?: string | null;
  resetTokenExpiry?: Date | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  emailNotifications?: boolean;
  /** Date à laquelle la possession de l'email a été prouvée (connexion Google, lien de réinitialisation). */
  emailVerifiedAt?: Date | null;
  /** Dernier changement ou retrait du mot de passe : les sessions ouvertes avant sont révoquées. */
  passwordChangedAt?: Date | null;
}

//
// 2) Document Mongoose typé
//
export interface IUserDocument extends IUser, Document {
  createdAt?: Date;
  updatedAt?: Date;
}

//
// 3) Schéma Mongoose typé
//
const userSchema = new Schema<IUserDocument>(
  {
    name: { type: String },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    provider: { type: String, default: "credentials" },
    // select: false — champs sensibles jamais renvoyés par défaut, faire .select("+password") explicitement
    password: { type: String, select: false }, // utilisée avec Credentials
    role: { type: String, enum: ["user", "admin"], default: "user" },
    resetToken: { type: String, select: false },
    resetTokenExpiry: { type: Date, select: false },
    phone: { type: String },
    address: { type: String },
    city: { type: String },
    postalCode: { type: String },
    emailNotifications: { type: Boolean, default: true },
    emailVerifiedAt: { type: Date },
    passwordChangedAt: { type: Date },
  },
  { timestamps: true }
);

//
// 4) Modèle Mongoose typé
//
const User: Model<IUserDocument> =
  models.User || model<IUserDocument>("User", userSchema);

export default User;