"use client";

import Snowfall from "react-snowfall";

export default function SnowfallClient() {
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
