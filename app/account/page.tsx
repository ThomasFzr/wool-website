import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { redirect } from "next/navigation";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);

  // 🔐 Protection : si pas connecté → page de login
  if (!session || !session.user) {
    redirect("/api/auth/signin?callbackUrl=/account");
  }

  const user = session.user;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between">
          <a
            href="/"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Retour à la boutique
          </a>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight mb-6">
          Mon compte
        </h1>

        {/* Carte utilisateur */}
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-lg font-semibold text-white">
            {user.name?.[0]?.toUpperCase() ??
              user.email?.[0]?.toUpperCase() ??
              "👤"}
          </div>

          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold text-slate-900">
              {user.name ?? "Utilisateur"}
            </p>
            {user.email && (
              <p className="text-sm text-slate-600">{user.email}</p>
            )}
          </div>
        </section>

        {/* Infos supplémentaires */}
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Informations du compte
          </h2>
          <p className="text-xs text-slate-600">
            Pour l’instant, le compte sert principalement à gérer vos
            réservations. Plus de fonctionnalités arriveront plus tard ✨
          </p>
        </section>

        <section className="mt-6 flex gap-3">
          <a
            href="/orders"
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Voir mes réservations
          </a>
        </section>
      </div>
    </main>
  );
}