// /**
//  * Script pour dupliquer une base de données MongoDB
//  * 
//  * Usage:
//  *   MONGODB_URI_SOURCE="mongodb://source" MONGODB_URI_TARGET="mongodb://target" tsx scripts/duplicate-db.ts
//  * 
//  * Ou avec des variables d'environnement dans .env.local:
//  *   MONGODB_URI_SOURCE et MONGODB_URI_TARGET
//  */

// import { config } from "dotenv";
// import { resolve } from "path";
// import { MongoClient } from "mongodb";

// // Charger les variables d'environnement depuis .env.local
// config({ path: resolve(process.cwd(), ".env.local") });
// config({ path: resolve(process.cwd(), ".env") });

// const SOURCE_URI = process.env.MONGODB_URI_SOURCE || process.env.MONGODB_URI;
// const TARGET_URI = process.env.MONGODB_URI_TARGET || process.env.MONGODB_URI_LOCAL;

// if (!SOURCE_URI || !TARGET_URI) {
//   console.error("❌ Erreur: MONGODB_URI_SOURCE et MONGODB_URI_TARGET doivent être définis\n");
//   console.log("📝 Ajoutez ces variables dans votre fichier .env.local :\n");
//   console.log("  MONGODB_URI_SOURCE=mongodb+srv://user:pass@cluster.mongodb.net/production");
//   console.log("  MONGODB_URI_TARGET=mongodb://localhost:27017/wool-starter-dev");
//   console.log("\n💡 Ou passez-les directement en ligne de commande :");
//   console.log("  MONGODB_URI_SOURCE='...' MONGODB_URI_TARGET='...' npm run duplicate-db\n");
//   process.exit(1);
// }

// async function duplicateDatabase() {
//   let sourceClient: MongoClient | null = null;
//   let targetClient: MongoClient | null = null;

//   try {
//     console.log("🔄 Début de la duplication de la base de données...\n");

//     // Connexion à la source
//     console.log("📥 Connexion à la base source...");
//     sourceClient = new MongoClient(SOURCE_URI);
//     await sourceClient.connect();
//     const sourceDb = sourceClient.db();
//     const sourceDbName = sourceDb.databaseName;
//     console.log(`✅ Connecté à la source: ${sourceDbName}\n`);

//     // Connexion à la cible
//     console.log("📤 Connexion à la base cible...");
//     targetClient = new MongoClient(TARGET_URI);
    
//     try {
//       await targetClient.connect();
//     } catch (connectError: any) {
//       if (connectError.code === "ECONNREFUSED" || connectError.message?.includes("ECONNREFUSED")) {
//         console.error("\n❌ Impossible de se connecter à MongoDB local");
//         console.error("\n💡 Solutions possibles :\n");
//         console.error("1. Installer et démarrer MongoDB localement :");
//         console.error("   macOS: brew install mongodb-community && brew services start mongodb-community");
//         console.error("   Linux: sudo systemctl start mongod");
//         console.error("\n2. Utiliser Docker :");
//         console.error("   docker run -d -p 27017:27017 --name mongodb mongo:latest");
//         console.error("\n3. Utiliser une base MongoDB Atlas pour le développement :");
//         console.error("   MONGODB_URI_TARGET=mongodb+srv://user:pass@cluster.mongodb.net/dev");
//         console.error("\n4. Vérifier que MongoDB est bien démarré :");
//         console.error("   mongosh --eval 'db.version()'");
//         throw connectError;
//       }
//       throw connectError;
//     }
    
//     const targetDb = targetClient.db();
//     const targetDbName = targetDb.databaseName;
//     console.log(`✅ Connecté à la cible: ${targetDbName}\n`);

//     // Lister toutes les collections
//     const collections = await sourceDb.listCollections().toArray();
//     console.log(`📋 ${collections.length} collection(s) trouvée(s)\n`);

//     if (collections.length === 0) {
//       console.warn("⚠️  Aucune collection trouvée dans la base source!");
//       console.warn("   Vérifiez que MONGODB_URI_SOURCE pointe vers la bonne base de données.\n");
//     }

//     let totalDocuments = 0;
//     let collectionsWithData = 0;

//     // Dupliquer chaque collection
//     for (const collectionInfo of collections) {
//       const collectionName = collectionInfo.name;
//       console.log(`📦 Copie de la collection: ${collectionName}...`);

//       const sourceCollection = sourceDb.collection(collectionName);
//       const targetCollection = targetDb.collection(collectionName);

//       // Compter les documents
//       const count = await sourceCollection.countDocuments();
//       console.log(`   ${count} document(s) à copier`);

//       if (count === 0) {
//         console.log(`   ⚠️  Collection vide, ignorée\n`);
//         continue;
//       }

//       totalDocuments += count;
//       collectionsWithData++;

//       // Vider la collection cible si elle existe
//       const existingCount = await targetCollection.countDocuments();
//       if (existingCount > 0) {
//         console.log(`   🗑️  Suppression de ${existingCount} document(s) existant(s)...`);
//         await targetCollection.deleteMany({});
//       }

//       // Copier les documents par batch pour éviter la surcharge mémoire
//       const batchSize = 1000;
//       let copied = 0;

//       const cursor = sourceCollection.find({});
      
//       let batch: any[] = [];
//       for await (const doc of cursor) {
//         batch.push(doc);
        
//         if (batch.length >= batchSize) {
//           await targetCollection.insertMany(batch);
//           copied += batch.length;
//           process.stdout.write(`   ${copied}/${count} document(s) copié(s)\r`);
//           batch = [];
//         }
//       }

//       // Insérer les derniers documents
//       if (batch.length > 0) {
//         await targetCollection.insertMany(batch);
//         copied += batch.length;
//       }

//       console.log(`   ✅ ${copied} document(s) copié(s)\n`);
//     }

//     console.log("✨ Duplication terminée avec succès!");
//     console.log(`\n📊 Résumé:`);
//     console.log(`   Source: ${sourceDbName}`);
//     console.log(`   Cible: ${targetDbName}`);
//     console.log(`   Collections: ${collections.length}`);
//     console.log(`   Collections avec données: ${collectionsWithData}`);
//     console.log(`   Documents copiés: ${totalDocuments}`);

//     if (totalDocuments === 0) {
//       console.log(`\n⚠️  Aucun document n'a été copié!`);
//       console.log(`   La base source "${sourceDbName}" semble être vide.`);
//       console.log(`   Vérifiez que MONGODB_URI_SOURCE pointe vers la bonne base de données.`);
//     }

//   } catch (error: any) {
//     if (error.code === "ECONNREFUSED" || error.message?.includes("ECONNREFUSED")) {
//       // Message déjà affiché dans le bloc try
//       process.exit(1);
//     }
//     console.error("\n❌ Erreur lors de la duplication:", error.message || error);
//     if (error.stack && process.env.DEBUG) {
//       console.error("\nStack trace:", error.stack);
//     }
//     process.exit(1);
//   } finally {
//     if (sourceClient) {
//       await sourceClient.close();
//       console.log("\n🔌 Déconnecté de la source");
//     }
//     if (targetClient) {
//       await targetClient.close();
//       console.log("🔌 Déconnecté de la cible");
//     }
//   }
// }

// // Exécuter le script
// duplicateDatabase()
//   .then(() => {
//     console.log("\n👋 Terminé!");
//     process.exit(0);
//   })
//   .catch((error) => {
//     console.error("❌ Erreur fatale:", error);
//     process.exit(1);
//   });
