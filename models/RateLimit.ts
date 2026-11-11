import mongoose, { Schema } from "mongoose";

// Un compteur par clé (ex. "login:ip:1.2.3.4") et par fenêtre de temps (lib/rate-limit.ts).
// Stocké en base pour être partagé entre toutes les instances serverless ; MongoDB
// supprime les fenêtres terminées (index TTL sur expiresAt).
const schema = new Schema({
  _id: { type: String, required: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

export default mongoose.models.RateLimit || mongoose.model("RateLimit", schema);
