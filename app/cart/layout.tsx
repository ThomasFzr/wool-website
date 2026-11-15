import { Metadata } from "next";
import { NOINDEX } from "@/lib/site";

// Page privée : pas d'indexation (robots.txt l'interdit aussi)
export const metadata: Metadata = { robots: NOINDEX };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
