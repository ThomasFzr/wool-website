import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth";
import { cloudinary } from "@/lib/cloudinary";

/**
 * Signe un envoi d'images vers Cloudinary pour l'admin.
 *
 * Les envois se font depuis le navigateur, mais avec une signature calculée ici avec le
 * secret de l'API : sans elle, Cloudinary refuse l'upload (un preset non signé exposé dans
 * le bundle permettait à n'importe qui de remplir le compte). Le preset, facultatif, reste
 * côté serveur. Une signature est valable une heure.
 */
export async function POST() {
  const session = await checkAdminAuth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret } = cloudinary.config();
  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "Cloudinary n'est pas configuré." }, { status: 500 });
  }

  const params: Record<string, string | number> = { timestamp: Math.round(Date.now() / 1000) };
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
  if (uploadPreset) params.upload_preset = uploadPreset;

  const signature = cloudinary.utils.api_sign_request(params, apiSecret);

  return NextResponse.json({ cloudName, apiKey, signature, ...params });
}
