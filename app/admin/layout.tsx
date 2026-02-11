export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 w-full max-w-full overflow-x-hidden">
      {children}
    </div>
  );
}
