import mongoose, { Schema } from "mongoose";

const settingsSchema = new Schema(
  {
    _id: { type: String, default: "main" },
    title: String,
    subtitle: String,
  },
  { timestamps: true }
);

export default mongoose.models.Settings ||
  mongoose.model("Settings", settingsSchema);