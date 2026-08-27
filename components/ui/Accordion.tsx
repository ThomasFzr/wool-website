"use client";

import { useState } from "react";

/**
 * Sanitisation défensive du HTML venant de la base de données avant injection :
 * - retire les balises script/style/iframe/object/embed (et leur contenu)
 * - retire les attributs de gestion d'événements (onclick, onerror, ...)
 * - retire les href/src en javascript:
 */
function sanitizeHtml(html: string): string {
  let cleaned = html;

  // Retirer les balises dangereuses et leur contenu
  cleaned = cleaned.replace(
    /<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi,
    ""
  );
  // Retirer les balises dangereuses auto-fermantes ou non fermées
  cleaned = cleaned.replace(/<\/?(script|style|iframe|object|embed)\b[^>]*>/gi, "");

  // Retirer les attributs on* (onclick, onerror, onload, ...)
  cleaned = cleaned.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  cleaned = cleaned.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  cleaned = cleaned.replace(/\son\w+\s*=\s*[^\s>]+/gi, "");

  // Retirer les href/src en javascript:
  cleaned = cleaned.replace(/\s(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, "");
  cleaned = cleaned.replace(/\s(href|src)\s*=\s*'\s*javascript:[^']*'/gi, "");
  cleaned = cleaned.replace(/\s(href|src)\s*=\s*javascript:[^\s>]+/gi, "");

  return cleaned;
}

interface AccordionItem {
  title: string;
  content: string | React.ReactNode;
  renderAsHtml?: boolean; // Si true, le contenu string sera rendu comme HTML
}

interface AccordionProps {
  items: AccordionItem[];
  defaultOpen?: number; // Index de l'item à ouvrir par défaut (-1 pour aucun)
}

export function Accordion({ items, defaultOpen = -1 }: AccordionProps) {
  const [openIndex, setOpenIndex] = useState<number>(defaultOpen);

  const toggleItem = (index: number) => {
    setOpenIndex(openIndex === index ? -1 : index);
  };

  return (
    <div className="bg-slate-50/50 rounded-lg p-4 md:p-6 space-y-1">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        
        return (
          <div
            key={index}
            className="border-b border-slate-200 last:border-b-0"
          >
            <button
              onClick={() => toggleItem(index)}
              className="flex w-full items-center justify-between py-4 text-left transition-colors hover:text-slate-900 cursor-pointer"
              aria-expanded={isOpen}
            >
              <span className="font-medium text-slate-900 uppercase tracking-wide text-sm">
                {item.title}
              </span>
              <svg
                className={`h-5 w-5 text-slate-600 transition-transform duration-200 ${
                  isOpen ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                isOpen ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <div className="pb-4 text-slate-700 text-sm">
                {typeof item.content === "string" ? (
                  item.renderAsHtml ? (
                    <div 
                      className="[&_p]:mb-3 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-slate-900"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.content) }}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap">{item.content}</p>
                  )
                ) : (
                  item.content
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
