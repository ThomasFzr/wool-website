// app/login/page.tsx
import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default function Page() {
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