"use client";

import { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, isVisible, onClose, duration = 3000 }: ToastProps) {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      const timer = setTimeout(() => {
        onClose();
      }, duration);

      return () => clearTimeout(timer);
    } else {
      // Délai pour l'animation de sortie
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transform transition-all duration-300 ${
        isVisible
          ? "translate-y-0 opacity-100"
          : "translate-y-4 opacity-0"
      }`}
    >
      <div className="flex items-center gap-3 rounded-full bg-slate-900 px-6 py-3 shadow-lg">
        <svg
          className="h-5 w-5 text-green-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
        <span className="text-sm font-medium text-white">{message}</span>
      </div>
    </div>
  );
}
