import Link from "next/link";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="min-h-screen">
      <Header />
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] px-4">
        <div className="text-center max-w-2xl">
          <h1 className="text-9xl font-bold text-slate-900 mb-4">404</h1>
          <h2 className="text-3xl sm:text-4xl font-semibold text-slate-800 mb-4">
            Page introuvable
          </h2>
          <p className="text-lg text-slate-600 mb-8">
            Désolé, la page que vous recherchez n'existe pas ou a été déplacée.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/">
              <Button size="lg" className="cursor-pointer">
                Retour à l'accueil
              </Button>
            </Link>
            <Link href="/contact">
              <Button variant="secondary" size="lg" className="cursor-pointer">
                Nous contacter
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

