import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import Link from "next/link";
import AccountClient from "./AccountClient";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);

  // 🔐 Protection : si pas connecté → page de login
  if (!session || !session.user) {
    redirect("/api/auth/signin?callbackUrl=/account");
  }

  // Récupérer le profil complet de l'utilisateur
  await connectToDatabase();
  const userDoc = await User.findOne({ email: session.user.email })
    .select("-password -resetToken -resetTokenExpiry")
    .lean();

  const user = {
    name: userDoc?.name || session.user.name || null,
    email: session.user.email!,
    image: session.user.image || null,
    phone: userDoc?.phone || null,
    address: userDoc?.address || null,
    city: userDoc?.city || null,
    postalCode: userDoc?.postalCode || null,
    emailNotifications: userDoc?.emailNotifications ?? true,
    provider: userDoc?.provider || (session.user as any).provider || "unknown",
    role: (session.user as any).role ?? "user",
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href="/"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Retour à la boutique
          </Link>
        </div>

        <h1 className="mb-6 text-2xl font-semibold tracking-tight">
          Mon compte
        </h1>

        {/* Carte utilisateur */}
        <section className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl bg-white p-4 sm:p-6 shadow-sm ring-1 ring-slate-100 mb-6">
          <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-slate-900 text-base sm:text-lg font-semibold text-white overflow-hidden shrink-0">
              {user.image ? (
                <img
                  src={user.image}
                  alt="Avatar"
                  className="h-12 w-12 sm:h-14 sm:w-14 rounded-full object-cover"
                />
              ) : (
                user.name?.[0]?.toUpperCase() ??
                user.email?.[0]?.toUpperCase() ??
                "👤"
              )}
            </div>

            <div className="flex-1 space-y-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">
                {user.name ?? "Utilisateur"}
              </p>

              {user.email && (
                <p className="text-xs sm:text-sm text-slate-600 truncate">{user.email}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Link
              href="/account/orders"
              className="flex-1 sm:flex-none inline-flex items-center justify-center rounded-full bg-slate-900 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-slate-800"
            >
              📦 <span className="ml-1.5">Réservations</span>
            </Link>
            <LogoutButton />
          </div>
        </section>

        {/* Composant client pour la gestion du profil */}
        <AccountClient user={user} />
      </div>
    </main>
  );
}
