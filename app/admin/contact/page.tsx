"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button, Card, Badge } from "@/components";

type Contact = {
  _id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: "new" | "read" | "replied" | "archived";
  creationId?: {
    _id: string;
    title: string;
    imageUrl?: string;
    images?: string[];
  } | null;
  createdAt: string;
  updatedAt: string;
};

export default function AdminContactPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated" || session?.user?.role !== "admin") {
      router.push("/");
    }
  }, [session, status, router]);

  useEffect(() => {
    if (session?.user?.role === "admin") {
      loadContacts();
    }
  }, [session, filter]);

  async function loadContacts() {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/contact?status=${filter}`);
      if (!res.ok) throw new Error("Erreur de chargement");
      const data = await res.json();
      setContacts(data);
    } catch (err) {
      console.error(err);
      setMessage("Erreur lors du chargement des messages.");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, newStatus: Contact["status"]) {
    try {
      const res = await fetch(`/api/admin/contact/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error("Erreur lors de la mise à jour");

      setMessage("✔️ Statut mis à jour");
      setTimeout(() => setMessage(null), 2000);
      loadContacts();
      if (selectedContact?._id === id) {
        setSelectedContact({ ...selectedContact, status: newStatus });
      }
    } catch (err) {
      console.error(err);
      setMessage("Erreur lors de la mise à jour.");
    }
  }

  async function deleteContact(id: string) {
    const ok = confirm("Êtes-vous sûr de vouloir supprimer ce message ?");
    if (!ok) return;

    try {
      const res = await fetch(`/api/admin/contact/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Erreur lors de la suppression");

      setMessage("✔️ Message supprimé");
      setTimeout(() => setMessage(null), 2000);
      setSelectedContact(null);
      loadContacts();
    } catch (err) {
      console.error(err);
      setMessage("Erreur lors de la suppression.");
    }
  }

  function getStatusBadge(status: Contact["status"]) {
    switch (status) {
      case "new":
        return <Badge variant="danger">Nouveau</Badge>;
      case "read":
        return <Badge variant="default">Lu</Badge>;
      case "replied":
        return <Badge variant="default" className="bg-green-100 text-green-800">Répondu</Badge>;
      case "archived":
        return <Badge variant="default" className="bg-slate-200 text-slate-600">Archivé</Badge>;
    }
  }

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-600">Chargement...</div>
      </main>
    );
  }

  if (!session || session.user.role !== "admin") {
    return null;
  }

  const newCount = contacts.filter((c) => c.status === "new").length;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-2"
            >
              ← Retour à l&apos;administration
            </Link>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              📧 Messages de contact
            </h1>
          </div>

          {newCount > 0 && (
            <Badge variant="danger" className="h-8 px-3 text-sm">
              {newCount} nouveau{newCount > 1 ? "x" : ""}
            </Badge>
          )}
        </div>

        {/* Message */}
        {message && (
          <div
            className={`mb-4 rounded-lg p-3 text-sm ${
              message.includes("✔️")
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {message}
          </div>
        )}

        {/* Filtres */}
        <div className="mb-4 flex items-center gap-2 overflow-x-auto">
          {[
            { value: "all", label: "Tous" },
            { value: "new", label: "Nouveaux" },
            { value: "read", label: "Lus" },
            { value: "replied", label: "Répondus" },
            { value: "archived", label: "Archivés" },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition ${
                filter === f.value
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Liste des messages */}
          <Card className="p-4 h-[calc(100vh-240px)] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Messages ({contacts.length})
            </h2>

            {loading && <p className="text-sm text-slate-500">Chargement...</p>}

            {!loading && contacts.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">
                Aucun message trouvé.
              </p>
            )}

            <div className="space-y-2">
              {contacts.map((contact) => (
                <button
                  key={contact._id}
                  onClick={() => {
                    setSelectedContact(contact);
                    if (contact.status === "new") {
                      updateStatus(contact._id, "read");
                    }
                  }}
                  className={`w-full text-left rounded-lg border p-3 transition ${
                    selectedContact?._id === contact._id
                      ? "border-slate-900 bg-slate-50"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className={`text-sm font-semibold ${
                      contact.status === "new" ? "text-slate-900" : "text-slate-700"
                    }`}>
                      {contact.name}
                    </span>
                    {getStatusBadge(contact.status)}
                  </div>
                  <p className="text-xs text-slate-600 mb-1">{contact.email}</p>
                  <p className="text-sm font-medium text-slate-900 mb-1">
                    {contact.subject}
                  </p>
                  <p className="text-xs text-slate-500 line-clamp-2">
                    {contact.message}
                  </p>
                  <p className="text-xs text-slate-400 mt-2">
                    {new Date(contact.createdAt).toLocaleString("fr-FR")}
                  </p>
                </button>
              ))}
            </div>
          </Card>

          {/* Détails du message */}
          <Card className="p-4 h-[calc(100vh-240px)] overflow-y-auto">
            {selectedContact ? (
              <>
                <div className="flex items-start justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Détails du message
                  </h2>
                  {getStatusBadge(selectedContact.status)}
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500">De</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {selectedContact.name}
                    </p>
                    <a
                      href={`mailto:${selectedContact.email}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {selectedContact.email}
                    </a>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-slate-500">Sujet</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {selectedContact.subject}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">Message</p>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-sm text-slate-900 whitespace-pre-line">
                        {selectedContact.message}
                      </p>
                    </div>
                  </div>

                  {selectedContact.creationId && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-2">
                        Création concernée
                      </p>
                      <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                        {(selectedContact.creationId.images?.[0] ||
                          selectedContact.creationId.imageUrl) && (
                          <img
                            src={
                              selectedContact.creationId.images?.[0] ||
                              selectedContact.creationId.imageUrl
                            }
                            alt={selectedContact.creationId.title}
                            className="h-16 w-16 rounded-lg object-cover"
                          />
                        )}
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-900">
                            {selectedContact.creationId.title}
                          </p>
                          <p className="text-xs text-slate-500">
                            ID: {selectedContact.creationId._id}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-medium text-slate-500">Date</p>
                    <p className="text-sm text-slate-900">
                      {new Date(selectedContact.createdAt).toLocaleString("fr-FR", {
                        dateStyle: "full",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-200 space-y-2">
                    <p className="text-xs font-medium text-slate-700 mb-2">
                      Changer le statut
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => updateStatus(selectedContact._id, "read")}
                        disabled={selectedContact.status === "read"}
                      >
                        Marquer comme lu
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => updateStatus(selectedContact._id, "replied")}
                        disabled={selectedContact.status === "replied"}
                      >
                        Marquer comme répondu
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => updateStatus(selectedContact._id, "archived")}
                        disabled={selectedContact.status === "archived"}
                      >
                        Archiver
                      </Button>
                    </div>

                    <div className="pt-2">
                      <a
                        href={`mailto:${selectedContact.email}?subject=Re: ${selectedContact.subject}`}
                        className="inline-block"
                      >
                        <Button size="sm">📧 Répondre par email</Button>
                      </a>
                    </div>

                    <div className="pt-2">
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => deleteContact(selectedContact._id)}
                      >
                        🗑️ Supprimer
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-slate-500">
                  Sélectionnez un message pour voir les détails
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
