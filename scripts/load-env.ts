// Charge les variables d'environnement AVANT tout autre import.
// Importer ce fichier en toute première ligne des scripts : les imports ES
// étant hoistés et évalués dans l'ordre, cela garantit que .env/.env.local
// sont chargés avant que lib/db (qui lit MONGODB_URI à l'import) ne s'exécute.
import { config } from "dotenv";

config({ path: ".env" });
// .env.local surcharge .env (même convention que Next.js)
config({ path: ".env.local", override: true });
