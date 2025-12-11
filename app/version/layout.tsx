import { Metadata } from "next";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noindex: true,
    nofollow: true,
  },
};

export default function VersionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
