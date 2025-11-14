import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="font-sans bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}