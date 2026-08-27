import { notFound } from "next/navigation";
import Link from "next/link";
import {
  isEmailPreviewEnabled,
  listCapturedEmails,
  readCapturedEmail,
} from "@/lib/emailOutbox";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Emails capturés (dev)",
  robots: { index: false, follow: false },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

export default async function DevEmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  // Outil de développement : inexistant en production
  if (process.env.NODE_ENV === "production") notFound();

  const { id } = await searchParams;
  const emails = await listCapturedEmails();
  const selected = id ? await readCapturedEmail(id) : emails[0] ?? null;

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            Emails capturés
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {isEmailPreviewEnabled() ? (
              <>
                Les emails ne sont <strong>pas envoyés</strong> en local : ils
                sont capturés ici. Pour forcer un envoi réel via Resend, lancez
                le serveur avec <code className="rounded bg-slate-200 px-1">EMAIL_TRANSPORT=resend</code>.
              </>
            ) : (
              <>
                <strong>Mode envoi réel actif</strong> (EMAIL_TRANSPORT=resend) :
                les emails partent chez Resend et ne sont plus capturés.
              </>
            )}
          </p>
        </header>

        {emails.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">
            Aucun email capturé pour le moment.
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            {/* Liste */}
            <ul className="space-y-2">
              {emails.map((email) => {
                const isActive = selected?.id === email.id;
                return (
                  <li key={email.id}>
                    <Link
                      href={`/dev/emails?id=${email.id}`}
                      className={`block rounded-lg border p-3 transition ${
                        isActive
                          ? "border-slate-900 bg-white shadow-sm"
                          : "border-slate-200 bg-white/60 hover:border-slate-400"
                      }`}
                    >
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {email.subject}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {email.to}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {formatDate(email.sentAt)}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* Aperçu */}
            {selected && (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    {selected.subject}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    À : {selected.to} · {formatDate(selected.sentAt)}
                  </p>
                </div>
                {/* sandbox vide : le HTML de l'email ne peut ni exécuter de script
                    ni naviguer — un simple rendu visuel du template */}
                <iframe
                  title={selected.subject}
                  src={`/dev/emails/${selected.id}/raw`}
                  sandbox=""
                  className="h-[70vh] w-full bg-white"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
