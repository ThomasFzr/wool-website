"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { PASSWORD_WARNING_MESSAGES } from "@/lib/password-policy";

/**
 * Invite à changer un mot de passe trop court ou compromis, constaté à la connexion
 * (authorize, authOptions.ts). Fixé en bas de l'écran pour rester visible sous le header
 * fixe ; « Plus tard » le masque jusqu'au prochain chargement complet de la page. Un
 * espace réservé en fin de page évite qu'il recouvre le dernier bouton (paiement…).
 */
export function PasswordWarningBanner() {
  const { data: session } = useSession();
  const [dismissed, setDismissed] = useState(false);
  const warning = session?.passwordWarning;
  if (!warning || dismissed) return null;

  return (
    <>
      <div aria-hidden className="h-32 sm:h-20" />
      <div
        role="status"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-4xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <strong>{PASSWORD_WARNING_MESSAGES[warning]}</strong> Pour protéger votre compte,
            choisissez-en un nouveau (onglet « Mot de passe » de votre compte).
          </p>
          <div className="flex shrink-0 gap-2">
            <Link
              href="/account"
              className="rounded-full bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
            >
              Changer mon mot de passe
            </Link>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="cursor-pointer rounded-full border border-amber-400 px-3 py-1.5 text-xs hover:bg-amber-100"
            >
              Plus tard
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
