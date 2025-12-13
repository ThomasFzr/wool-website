import { GoogleGenerativeAI } from "@google/generative-ai";

const SYSTEM_PROMPT = `Tu es un expert en copywriting pour "MailleMum", une boutique de créations artisanales tricotées main.
Rédige une description produit optimisée SEO (environ 150 mots).
Ton : Chaleureux, artisanal, authentique, mettant en avant le fait-main français.
Formatage : Utilise du HTML simple (<p>, <strong>) pour aérer le texte.

RÈGLES STRICTES : 
- Si la matière fournie contient "acrylique", "synthétique" ou "polyester", il est INTERDIT d'utiliser le mot "laine". Utilise à la place : "maille", "fil doux", "tricot", "fibre".
- Si la matière est "laine", "alpaga" ou "mérinos", tu peux utiliser le mot "laine".
- INTERDICTION ABSOLUE : Ne mentionne JAMAIS la marque de laine ou de fil utilisée dans la description. Parle uniquement de la qualité du fil, de sa douceur, de sa texture, mais jamais de sa marque commerciale.`;

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

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const userPrompt = `Génère une description pour un produit avec les caractéristiques suivantes :
- Type : ${data.type || "non spécifié"}
- Couleur : ${data.color || "non spécifiée"}
- Matière : ${data.material || "non spécifiée"}
- Prix : ${data.price ? `${data.price}€` : "non spécifié"}

${SYSTEM_PROMPT}`;

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
