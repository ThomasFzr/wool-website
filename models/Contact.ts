import mongoose, { Schema, model, models, type Document, type Model } from "mongoose";

export interface IContact {
  name: string;
  email: string;
  subject: string;
  message: string;
  creationId?: mongoose.Types.ObjectId | null;
  userId?: mongoose.Types.ObjectId | null;
  status: "new" | "read" | "replied" | "archived";
}

export interface IContactDocument extends IContact, Document {
  createdAt?: Date;
  updatedAt?: Date;
}

const contactSchema = new Schema<IContactDocument>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    creationId: { type: Schema.Types.ObjectId, ref: "Creation", default: null },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    status: { type: String, enum: ["new", "read", "replied", "archived"], default: "new" },
  },
  { timestamps: true }
);

const Contact: Model<IContactDocument> =
  models.Contact || model<IContactDocument>("Contact", contactSchema);

export default Contact;
