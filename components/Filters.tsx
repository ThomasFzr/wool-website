"use client";

import { useRef, useEffect, useState } from "react";

interface FiltersProps {
  availableColors: string[];
  selectedColors: string[];
  onColorChange: (colors: string[]) => void;
  showOnlyAvailable: boolean;
  onAvailabilityChange: (value: boolean) => void;
}

export function Filters({
  availableColors,
  selectedColors,
  onColorChange,
  showOnlyAvailable,
  onAvailabilityChange,
}: FiltersProps) {
  const [colorDropdownOpen, setColorDropdownOpen] = useState(false);
  const colorDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (colorDropdownRef.current && !colorDropdownRef.current.contains(e.target as Node)) {
        setColorDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {/* Dropdown couleurs */}
      <div className="relative" ref={colorDropdownRef}>
        <button
          type="button"
          onClick={() => setColorDropdownOpen(!colorDropdownOpen)}
          className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <span>
            Couleur{selectedColors.length > 0 && ` (${selectedColors.length})`}
          </span>
          <span className={`transition-transform ${colorDropdownOpen ? "rotate-180" : ""}`}>
            ▼
          </span>
        </button>

        {colorDropdownOpen && (
          <div className="absolute left-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg animate-fadeIn">
            <div className="max-h-64 overflow-y-auto p-2">
              {availableColors.map((color) => (
                <label
                  key={color}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedColors.includes(color)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onColorChange([...selectedColors, color]);
                      } else {
                        onColorChange(selectedColors.filter((c) => c !== color));
                      }
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span>{color}</span>
                </label>
              ))}
            </div>
            {selectedColors.length > 0 && (
              <div className="border-t border-slate-200 p-2">
                <button
                  type="button"
                  onClick={() => onColorChange([])}
                  className="w-full rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Tout effacer
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filtre disponibilité */}
      <label className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
        <input
          type="checkbox"
          checked={showOnlyAvailable}
          onChange={(e) => onAvailabilityChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
        />
        <span>Disponibles uniquement</span>
      </label>
    </div>
  );
}
