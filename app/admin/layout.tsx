import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { NOINDEX } from "@/lib/site";

export const metadata: Metadata = { robots: NOINDEX };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Garde serveur : seuls les admins peuvent accéder à /admin/**
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="min-w-0 w-full max-w-full overflow-x-hidden">
      {children}
    </div>
  );
}
