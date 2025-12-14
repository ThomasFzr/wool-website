// app/login/page.tsx
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getServerSession(authOptions);

  // Si l'utilisateur est déjà connecté, rediriger vers la home
  if (session?.user) {
    redirect("/");
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