import { GoogleGenerativeAI } from "@google/generative-ai";
import { connectToDatabase } from "@/lib/db";
import Settings from "@/models/Settings";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/prompts";

export const GEMINI_TIMEOUT_MS = 30_000;
export const GEMINI_MAX_OUTPUT_TOKENS = 4096;

async function getSystemPrompt(): Promise<string> {
  try {
    await connectToDatabase();
    const settings = await Settings.findById("main").lean();
    return (settings as any)?.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  } catch (error) {
    console.error("Erreur lors de la récupération du prompt système:", error);
    return DEFAULT_SYSTEM_PROMPT;
  }
}

export async function generateProductDescription(data: {
  type: string;
  color: string;
  material: string;
  price: number;
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY n'est pas définie dans les variables d'environnement");
  }

  const systemPrompt = await getSystemPrompt();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel(
    {
      model: "gemini-2.5-flash",
      // Borne la longueur (et le coût) de la réponse. Sur gemini-2.5 la réflexion du modèle
      // compte dans cette limite : large marge pour une description de quelques paragraphes.
      generationConfig: { maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS },
    },
    // Sans délai, un appel bloqué occupait la fonction jusqu'à sa limite d'exécution
    { timeout: GEMINI_TIMEOUT_MS }
  );

  const userPrompt = `Génère une description pour un produit avec les caractéristiques suivantes :
- Type : ${data.type || "non spécifié"}
- Couleur : ${data.color || "non spécifiée"}
- Matière : ${data.material || "non spécifiée"}
- Prix : ${data.price ? `${data.price}€` : "non spécifié"}

${systemPrompt}`;

  try {
    const result = await model.generateContent(userPrompt);
    const response = await result.response;
    const text = response.text();
    
    return text;
  } catch (error) {
    console.error("Erreur lors de la génération avec Gemini:", error);
    throw new Error("Erreur lors de la génération de la description");
  }
}
