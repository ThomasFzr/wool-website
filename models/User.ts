import mongoose, { Schema, model, models, type Document, type Model } from "mongoose";

//
// 1) Interface TypeScript pour l'utilisateur
//
export interface IUser {
  name?: string | null;
  email: string;
  password?: string | null;
}

//
// 2) Document Mongoose typé
//
export interface IUserDocument extends IUser, Document {}

//
// 3) Schéma Mongoose typé
//
const userSchema = new Schema<IUserDocument>(
  {
    name: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String }, // utilisée avec Credentials
  },
  { timestamps: true }
);

//
// 4) Modèle Mongoose typé
//
const User: Model<IUserDocument> =
  models.User || model<IUserDocument>("User", userSchema);

export default User;