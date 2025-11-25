"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Badge } from "./ui";

interface HeaderProps {
  title?: string;
  subtitle?: string;
  pendingReservations?: number;
  newMessages?: number;
}

export function Header({ title, subtitle, pendingReservations: initialPending = 0, newMessages: initialMessages = 0 }: HeaderProps) {
  const { data: session } = useSession();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [pendingReservations, setPendingReservations] = useState(initialPending);
  const [newMessages, setNewMessages] = useState(initialMessages);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const totalNotifications = pendingReservations + newMessages;

  // Polling pour mettre à jour les notifications admin
  useEffect(() => {
    if (session?.user?.role !== "admin") return;

    const fetchNotifications = async () => {
      try {
        const [reservationsRes, messagesRes] = await Promise.all([
          fetch("/api/admin/reservations/count"),
          fetch("/api/admin/contact/count"),
        ]);

        if (reservationsRes.ok) {
          const data = await reservationsRes.json();
          setPendingReservations(data.pending || 0);
        }

        if (messagesRes.ok) {
          const data = await messagesRes.json();
          setNewMessages(data.new || 0);
        }
      } catch (err) {
        console.error("Erreur lors du chargement des notifications:", err);
      }
    };

    // Première vérification immédiate
    fetchNotifications();

    // Puis toutes les 30 secondes
    const interval = setInterval(fetchNotifications, 30000);

    return () => clearInterval(interval);
  }, [session]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <>
      {/* Header sticky avec logo et bouton alignés */}
      <header className="fixed top-0 left-0 right-0 z-30 h-24 sm:h-32">
        <div className="h-full flex items-center justify-between px-4">
          {/* Logo */}
          <img 
            src="/images/logo.png" 
            alt={title || "MailleMum"} 
            className="h-20 sm:h-28 w-auto object-contain"
          />
          
          {/* Titre H1 pour le SEO */}
          <h1 className="sr-only">
            {title || "MailleMum - Créations artisanales en laine"}
          </h1>

          {/* Bouton Mon compte */}
          <div ref={menuRef}>
            <button
              type="button"
              onClick={() => {
                if (!session) {
                  signIn(undefined, { callbackUrl: "/" });
                } else {
                  setAccountMenuOpen((o) => !o);
                }
              }}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-[13px] font-semibold text-white">
                {session
                  ? (session.user?.name?.[0]?.toUpperCase() ??
                    session.user?.email?.[0]?.toUpperCase() ??
                    "👤")
                  : "👤"}
              </span>

              <span className="hidden md:flex items-center gap-1.5">
                <span>{session ? "Mon compte" : "Se connecter"}</span>
                {session?.user?.role === "admin" && totalNotifications > 0 && (
                  <span className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-semibold">
                    {totalNotifications}
                  </span>
                )}
              </span>
            </button>

            {session && accountMenuOpen && (
              <div className="absolute right-0 z-10 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg animate-fadeIn">
                <Link
                  href="/account"
                  className="w-full block px-4 py-2 text-left text-sm hover:bg-slate-100"
                  onClick={() => setAccountMenuOpen(false)}
                >
                  Mon compte
                </Link>

                <Link
                  href="/account/orders"
                  className="w-full block px-4 py-2 text-left text-sm hover:bg-slate-100"
                  onClick={() => setAccountMenuOpen(false)}
                >
                  Mes réservations
                </Link>

                <Link
                  href="/contact"
                  className="w-full block px-4 py-2 text-left text-sm hover:bg-slate-100"
                  onClick={() => setAccountMenuOpen(false)}
                >
                  Contact
                </Link>

                {session.user?.role === "admin" && (
                  <>
                    <div className="border-t border-slate-200" />
                    <Link
                      href="/admin"
                      className="w-full flex items-center justify-between px-4 py-2 text-left text-sm font-medium text-slate-900 hover:bg-slate-100"
                      onClick={() => setAccountMenuOpen(false)}
                    >
                      <span>Administration</span>
                      {totalNotifications > 0 && (
                        <span className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-semibold">
                          {totalNotifications}
                        </span>
                      )}
                    </Link>
                  </>
                )}

                <div className="border-t border-slate-200" />

                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full block px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  Se déconnecter
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Spacer pour compenser le header fixe */}
      <div className="h-24 sm:h-32"></div>

      {/* Sous-titre */}
      {subtitle && (
        <div className="mx-auto max-w-5xl px-4 mb-4">
          <p className="text-lg sm:text-xl text-slate-600 whitespace-pre-line">
            {subtitle}
          </p>
        </div>
      )}
    </>
  );
}
