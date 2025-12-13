"use client";

import { useState } from "react";

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
                      dangerouslySetInnerHTML={{ __html: item.content }}
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
