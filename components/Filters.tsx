"use client";

import { useRef, useEffect, useState } from "react";

interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Fermeture au clic/toucher en dehors : pointerdown couvre souris ET doigt (sur iOS,
  // un toucher ne déclenche pas toujours mousedown), et Échap au clavier.
  useEffect(() => {
    if (!open) return;
    function handlePointer(e: PointerEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
      >
        <span>
          {label}{selected.length > 0 && ` (${selected.length})`}
        </span>
        <span className={`transition-transform ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg animate-fadeIn">
          <div className="max-h-64 overflow-y-auto p-2">
            {options.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onChange([...selected, option]);
                    } else {
                      onChange(selected.filter((v) => v !== option));
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                />
                <span>{option.charAt(0).toUpperCase() + option.slice(1)}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-slate-200 p-2">
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Tout effacer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
      <MultiSelectDropdown
        label="Type"
        options={availableTypes}
        selected={selectedTypes}
        onChange={onTypeChange}
      />

      {/* Dropdown couleurs */}
      <MultiSelectDropdown
        label="Couleur"
        options={availableColors}
        selected={selectedColors}
        onChange={onColorChange}
      />

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
