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
    email: { type: String, required: true, unique: true },
    provider: { type: String, default: "credentials" },
    password: { type: String }, // utilisée avec Credentials
    role: { type: String, enum: ["user", "admin"], default: "user" },
    resetToken: { type: String },
    resetTokenExpiry: { type: Date },
    phone: { type: String },
    address: { type: String },
    city: { type: String },
    postalCode: { type: String },
    emailNotifications: { type: Boolean, default: true },
  },
  { timestamps: true }
);

//
// 4) Modèle Mongoose typé
//
const User: Model<IUserDocument> =
  models.User || model<IUserDocument>("User", userSchema);

export default User;