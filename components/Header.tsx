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

export function Header({ title, subtitle, pendingReservations = 0, newMessages = 0 }: HeaderProps) {
  const { data: session } = useSession();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const totalNotifications = pendingReservations + newMessages;

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
    <header className="mb-8 flex flex-row items-start justify-between gap-4">
      <div className="flex-1">
        {title && (
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            {title}
          </h1>
        )}
        {subtitle && (
          <p className="mt-2 text-xl sm:text-2xl text-slate-600">
            {subtitle}
          </p>
        )}
      </div>

      <div className="relative shrink-0" ref={menuRef}>
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
              <Badge variant="danger" className="h-5 min-w-5 px-1.5 text-[10px]">
                {totalNotifications}
              </Badge>
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
                    <Badge variant="danger" className="h-5 min-w-5 px-1.5 text-[10px]">
                      {totalNotifications}
                    </Badge>
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
    </header>
  );
}
