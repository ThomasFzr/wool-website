"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Creation = {
  _id: string;
  title: string;
  price: number;
  description?: string;
  imageUrl: string;
  createdAt?: string;
};

export default function HomePage() {
  const [creations, setCreations] = useState<Creation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/creations");
        const data = await res.json();
        setCreations(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "2rem 1rem",
        background: "#f7fafc",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: 8 }}>
          Les créations en laine de maman 🧶
        </h1>
        <h2><Link href="/admin">Admin</Link></h2>
        <p style={{ color: "#4a5568", marginBottom: 24 }}>
          Une petite galerie pour partager ses tricots avec ses amies.
        </p>

        {loading && <p>Chargement des créations...</p>}

        {!loading && creations.length === 0 && (
          <p>Aucune création pour le moment. Va sur /admin pour en ajouter 😊</p>
        )}

        <div
          style={{
            display: "grid",
            gap: "1.5rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          {creations.map((c) => (
            <article
              key={c._id}
              style={{
                background: "white",
                borderRadius: 16,
                padding: 16,
                boxShadow:
                  "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {c.imageUrl && (
                <div
                  style={{
                    width: "100%",
                    paddingBottom: "62%",
                    borderRadius: 12,
                    overflow: "hidden",
                    marginBottom: 8,
                    background: "#e2e8f0",
                  }}
                >
                  {/* Image simple <img> pour ne pas t'embêter avec next/image au début */}
                  <img
                    src={c.imageUrl}
                    alt={c.title}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                </div>
              )}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <h2 style={{ fontWeight: 600 }}>{c.title}</h2>
                {c.price && (
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      background: "#e2e8f0",
                      padding: "4px 8px",
                      borderRadius: 8,
                    }}
                  >
                    {c.price} €
                  </span>
                )}
              </div>
              {c.description && (
                <p style={{ fontSize: 14, color: "#4a5568" }}>
                  {c.description}
                </p>
              )}
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}