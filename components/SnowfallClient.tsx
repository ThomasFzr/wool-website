"use client";

import { useState, useEffect } from "react";
import Snowfall from "react-snowfall";

export default function SnowfallClient() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    // Vérifier si on est sur un écran de bureau (>= 1024px)
    const checkIsDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };

    // Vérification initiale
    checkIsDesktop();

    // Écouter les changements de taille d'écran
    window.addEventListener("resize", checkIsDesktop);
    return () => window.removeEventListener("resize", checkIsDesktop);
  }, []);

  // Ne pas afficher les flocons sur mobile/tablette
  if (!isDesktop) {
    return null;
  }

  return (
    <Snowfall
      snowflakeCount={150}
      speed={[0.5, 2.0]}
      wind={[-0.5, 1.0]}
      radius={[1.0, 4.0]}
      color="#94a3b8"
      style={{ 
        opacity: 0.8,
        position: 'fixed',
        width: '100%',
        height: '100%',
        top: 0,
        left: 0,
        pointerEvents: 'none'
      }}
    />
  );
}
