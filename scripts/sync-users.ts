import "./load-env";
import mongoose from "mongoose";

async function syncUsers() {
  try {
    // Connexion à MongoDB
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
      throw new Error("❌ MONGODB_URI not found in environment variables");
    }

    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");
    
    const db = mongoose.connection.db;
    if (!db) {
      console.error("❌ Database connection not established");
      return;
    }

    // Définir le schéma User directement
    const userSchema = new mongoose.Schema({
      name: { type: String },
      email: { type: String, required: true, unique: true },
      provider: { type: String, default: "credentials" },
      password: { type: String },
      role: { type: String, enum: ["user", "admin"], default: "user" },
      phone: { type: String },
      address: { type: String },
      city: { type: String },
      postalCode: { type: String },
      emailNotifications: { type: Boolean, default: true },
    }, { timestamps: true });

    const User = mongoose.models.User || mongoose.model("User", userSchema);

    // Récupérer tous les comptes de NextAuth
    const accounts = await db.collection("accounts").find({}).toArray();
    const nextAuthUsers = await db.collection("users").find({}).toArray();
    
    console.log(`📊 Found ${accounts.length} accounts and ${nextAuthUsers.length} NextAuth users`);
    
    // Pour chaque utilisateur NextAuth, créer/mettre à jour dans notre collection User
    for (const naUser of nextAuthUsers) {
      const email = naUser.email;
      if (!email) continue;
      
      // Trouver le compte associé pour obtenir le provider
      const account = accounts.find((acc: any) => acc.userId?.toString() === naUser._id?.toString());
      const provider = account?.provider || "credentials";
      
      // Vérifier si l'utilisateur existe déjà dans notre collection
      const existingUser = await User.findOne({ email });
      
      if (existingUser) {
        // Mettre à jour le provider si nécessaire
        if (existingUser.provider !== provider) {
          await User.findOneAndUpdate(
            { email },
            { 
              $set: { 
                provider,
                name: naUser.name || existingUser.name
              } 
            }
          );
          console.log(`✅ Updated user: ${email} (provider: ${provider})`);
        } else {
          console.log(`⏭️  User already synced: ${email}`);
        }
      } else {
        // Créer un nouveau document dans notre collection User
        await User.create({
          email,
          name: naUser.name || null,
          provider,
          role: "user",
          emailNotifications: true,
        });
        console.log(`➕ Created user: ${email} (provider: ${provider})`);
      }
    }
    
    console.log("\n✅ Synchronization completed!");
    
  } catch (error) {
    console.error("❌ Error during synchronization:", error);
  } finally {
    await mongoose.disconnect();
  }
}

syncUsers();
