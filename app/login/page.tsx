// app/login/page.tsx
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { safeCallbackPath } from "@/lib/safe-redirect";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const session = await getServerSession(authOptions);

  // Utilisateur déjà connecté : l'envoyer directement là où il allait
  if (session?.user) {
    const { callbackUrl } = await searchParams;
    redirect(safeCallbackPath(typeof callbackUrl === "string" ? callbackUrl : null));
  }

  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-slate-500">
          Chargement de la page de connexion…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}