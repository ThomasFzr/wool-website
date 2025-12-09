"use client";

import { useState, useEffect } from "react";
import { CreationCard, Creation } from "@/components/CreationCard";
import { Filters } from "@/components/Filters";

type HomeClientProps = {
  initialCreations: Creation[];
  availableColors?: string[];
  availableTypes?: string[];
};

export function HomeClient({ initialCreations, availableColors = [], availableTypes = [] }: HomeClientProps) {
  const [creations] = useState<Creation[]>(initialCreations);
  
  // Récupérer les filtres du sessionStorage au montage
  const [selectedColors, setSelectedColors] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("filters_colors");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  
  const [selectedTypes, setSelectedTypes] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("filters_types");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("filters_available");
      return saved === "true";
    }
    return false;
  });

  // Sauvegarder les filtres dans le sessionStorage quand ils changent
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (selectedColors.length > 0) {
        sessionStorage.setItem("filters_colors", JSON.stringify(selectedColors));
      } else {
        sessionStorage.removeItem("filters_colors");
      }
    }
  }, [selectedColors]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (selectedTypes.length > 0) {
        sessionStorage.setItem("filters_types", JSON.stringify(selectedTypes));
      } else {
        sessionStorage.removeItem("filters_types");
      }
    }
  }, [selectedTypes]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (showOnlyAvailable) {
        sessionStorage.setItem("filters_available", "true");
      } else {
        sessionStorage.removeItem("filters_available");
      }
    }
  }, [showOnlyAvailable]);

  const handleClearAllFilters = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("filters_colors");
      sessionStorage.removeItem("filters_types");
      sessionStorage.removeItem("filters_available");
    }
  };

  // Filtrage des créations
  const filteredCreations = creations.filter((c) => {
    if (showOnlyAvailable && (c.sold || c.reserved)) {
      return false;
    }
    if (selectedColors.length > 0 && !selectedColors.includes(c.color || "")) {
      return false;
    }
    if (selectedTypes.length > 0 && !selectedTypes.includes(c.type || "")) {
      return false;
    }
    return true;
  });

  return (
    <>
      <div id="creations" className="mx-auto max-w-5xl px-4 py-8">
        {creations.length === 0 && (
          <p className="text-sm text-slate-500">
            Aucune création pour le moment.
          </p>
        )}

        {(availableColors.length > 0 || availableTypes.length > 0) && (
          <Filters
            availableColors={availableColors}
            selectedColors={selectedColors}
            onColorChange={setSelectedColors}
            availableTypes={availableTypes}
            selectedTypes={selectedTypes}
            onTypeChange={setSelectedTypes}
            showOnlyAvailable={showOnlyAvailable}
            onAvailabilityChange={setShowOnlyAvailable}
            onClearAll={handleClearAllFilters}
          />
        )}

        {filteredCreations.length > 0 && (
          <section className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCreations.map((creation, index) => (
              <CreationCard
                key={creation._id}
                creation={creation}
                priority={index < 3}
              />
            ))}
          </section>
        )}

        {creations.length > 0 && filteredCreations.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">
            Aucune création ne correspond à ces filtres.
          </p>
        )}
      </div>
    </>
  );
}
