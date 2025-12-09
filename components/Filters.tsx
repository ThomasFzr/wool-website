"use client";

import { useRef, useEffect, useState } from "react";

interface FiltersProps {
  availableColors: string[];
  selectedColors: string[];
  onColorChange: (colors: string[]) => void;
  availableTypes: string[];
  selectedTypes: string[];
  onTypeChange: (types: string[]) => void;
  showOnlyAvailable: boolean;
  onAvailabilityChange: (value: boolean) => void;
  onClearAll?: () => void;
}

export function Filters({
  availableColors,
  selectedColors,
  onColorChange,
  availableTypes,
  selectedTypes,
  onTypeChange,
  showOnlyAvailable,
  onAvailabilityChange,
  onClearAll,
}: FiltersProps) {
  const [colorDropdownOpen, setColorDropdownOpen] = useState(false);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const colorDropdownRef = useRef<HTMLDivElement | null>(null);
  const typeDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (colorDropdownRef.current && !colorDropdownRef.current.contains(e.target as Node)) {
        setColorDropdownOpen(false);
      }
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setTypeDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const hasActiveFilters = selectedColors.length > 0 || selectedTypes.length > 0 || showOnlyAvailable;

  const handleClearAll = () => {
    onColorChange([]);
    onTypeChange([]);
    onAvailabilityChange(false);
    if (onClearAll) {
      onClearAll();
    }
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {/* Dropdown types */}
      <div className="relative" ref={typeDropdownRef}>
        <button
          type="button"
          onClick={() => setTypeDropdownOpen(!typeDropdownOpen)}
          className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <span>
            Type{selectedTypes.length > 0 && ` (${selectedTypes.length})`}
          </span>
          <span className={`transition-transform ${typeDropdownOpen ? "rotate-180" : ""}`}>
            ▼
          </span>
        </button>

        {typeDropdownOpen && (
          <div className="absolute left-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg animate-fadeIn">
            <div className="max-h-64 overflow-y-auto p-2">
              {availableTypes.map((type) => (
                <label
                  key={type}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes(type)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onTypeChange([...selectedTypes, type]);
                      } else {
                        onTypeChange(selectedTypes.filter((t) => t !== type));
                      }
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span>{type.charAt(0).toUpperCase() + type.slice(1)}</span>
                </label>
              ))}
            </div>
            {selectedTypes.length > 0 && (
              <div className="border-t border-slate-200 p-2">
                <button
                  type="button"
                  onClick={() => onTypeChange([])}
                  className="w-full rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Tout effacer
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dropdown couleurs */}
      <div className="relative" ref={colorDropdownRef}>
        <button
          type="button"
          onClick={() => setColorDropdownOpen(!colorDropdownOpen)}
          className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
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
                  <span>{color.charAt(0).toUpperCase() + color.slice(1)}</span>
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

      {/* Bouton effacer tous les filtres */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={handleClearAll}
          className="ml-auto cursor-pointer rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Effacer tous les filtres
        </button>
      )}
    </div>
  );
}
