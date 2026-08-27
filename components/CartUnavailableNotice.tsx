"use client";

import { useCart } from "@/contexts/CartContext";

/**
 * Bandeau expliquant qu'un ou plusieurs articles ont été retirés du panier
 * parce qu'ils ne sont plus disponibles (vendus par un autre client entre-temps,
 * ou retirés du catalogue). Volontairement persistant, pas un toast fugace :
 * l'utilisateur doit comprendre pourquoi son total a changé.
 */
export function CartUnavailableNotice({ className = "" }: { className?: string }) {
  const { unavailableNotice, dismissUnavailableNotice } = useCart();

  if (!unavailableNotice) return null;

  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 ${className}`}
    >
      <svg
        className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
        />
      </svg>
      <p className="flex-1 text-sm text-amber-900">{unavailableNotice}</p>
      <button
        onClick={dismissUnavailableNotice}
        className="shrink-0 rounded-full p-1 text-amber-600 transition-colors hover:bg-amber-100 hover:text-amber-800 cursor-pointer"
        aria-label="Masquer ce message"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
