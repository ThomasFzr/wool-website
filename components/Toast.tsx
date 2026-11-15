"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface ToastProps {
  message: string;
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
  cartUrl?: string;
}

export function Toast({
  message,
  isVisible,
  onClose,
  duration = 4000,
  cartUrl,
}: ToastProps) {
  const [shouldRender, setShouldRender] = useState(false);
  // onClose est souvent une fonction recréée à chaque rendu du parent : en dépendre
  // relançait le minuteur à chaque rendu (le toast restait ~6 s au lieu de 4).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      const timer = setTimeout(() => {
        onCloseRef.current();
      }, duration);

      return () => clearTimeout(timer);
    } else {
      // Délai pour l'animation de sortie
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration]);

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed bottom-6 left-4 right-4 z-50 transform transition-all duration-300 ease-out ${
        isVisible
          ? "translate-y-0 opacity-100 scale-100"
          : "translate-y-8 opacity-0 scale-95"
      }`}
    >
      <div className="flex items-center gap-4 rounded-2xl bg-white px-4 py-4 shadow-2xl ring-1 ring-slate-200">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-6 w-6 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">{message}</p>
          {cartUrl && (
            <Link
              href={cartUrl}
              onClick={onClose}
              className="mt-1 text-xs font-medium text-slate-600 underline"
            >
              Voir le panier
            </Link>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
          aria-label="Fermer"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
