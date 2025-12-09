"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button, Card, Badge } from "@/components";
import { CreationModal } from "@/components/CreationModal";
import type { Creation } from "@/components/CreationCard";

type Contact = {
  _id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: "new" | "read" | "replied" | "archived";
  creationId?: Creation | null;
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
  const [showCreationModal, setShowCreationModal] = useState(false);
  const [selectedCreation, setSelectedCreation] = useState<Creation | null>(null);

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

  // Désactiver le scroll quand la modale est ouverte
  useEffect(() => {
    if (selectedContact) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = "unset";
      document.body.style.paddingRight = "0px";
    }

    return () => {
      document.body.style.overflow = "unset";
      document.body.style.paddingRight = "0px";
    };
  }, [selectedContact]);

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
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition cursor-pointer ${
                filter === f.value
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Liste des messages */}
        <Card className="p-4">
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
                className={`w-full text-left rounded-lg border p-3 transition cursor-pointer ${
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

        {/* Modal latérale pour les détails */}
        {selectedContact && (
          <>
            {/* Fond semi-transparent pour fermer au clic */}
            <div 
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 animate-fadeIn"
              onClick={() => setSelectedContact(null)}
            />
            
            <div className="fixed top-0 right-0 h-full w-full sm:w-[480px] bg-white shadow-2xl p-6 z-50 overflow-y-auto animate-slideInRight">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900">Détails du message</h2>
                <button
                  onClick={() => setSelectedContact(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 text-slate-600 cursor-pointer"
                  aria-label="Fermer"
                >
                  ✕
                </button>
              </div>

              {/* Statut */}
              <div className="mb-4">
                {getStatusBadge(selectedContact.status)}
              </div>

              {/* Informations de l'expéditeur */}
              <Card className="p-4 mb-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500">De</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {selectedContact.name}
                    </p>
                    <a
                      href={`mailto:${selectedContact.email}`}
                      className="text-sm text-blue-600 hover:underline cursor-pointer"
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

                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>🕒</span>
                    <span>{new Date(selectedContact.createdAt).toLocaleString("fr-FR")}</span>
                  </div>
                </div>
              </Card>

              {/* Message */}
              <Card className="p-4 mb-4 bg-slate-50">
                <p className="text-xs font-semibold text-slate-700 mb-2">💬 Message</p>
                <p className="text-sm text-slate-900 whitespace-pre-line">
                  {selectedContact.message}
                </p>
              </Card>

              {/* Création concernée */}
              {selectedContact.creationId && (
                <Card className="p-4 mb-4">
                  <p className="text-xs font-semibold text-slate-700 mb-3">📦 Création concernée</p>
                  <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 mb-3">
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
                      {selectedContact.creationId.price && (
                        <p className="text-xs text-slate-600">
                          {selectedContact.creationId.price} €
                        </p>
                      )}
                      {selectedContact.creationId.color && (
                        <p className="text-xs text-slate-500">
                          Couleur: {selectedContact.creationId.color}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setSelectedCreation(selectedContact.creationId!);
                      setShowCreationModal(true);
                    }}
                    className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-900 transition cursor-pointer"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                    Voir en détail
                  </button>
                </Card>
              )}

              {/* Actions */}
              <Card className="p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-700">Actions</p>
                
                <div className="space-y-2">
                  <a
                    href={`mailto:${selectedContact.email}?subject=Re: ${selectedContact.subject}`}
                    className="block"
                  >
                    <Button size="sm" className="w-full cursor-pointer">
                      📧 Répondre par email
                    </Button>
                  </a>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => updateStatus(selectedContact._id, "replied")}
                      disabled={selectedContact.status === "replied"}
                      className="cursor-pointer"
                    >
                      ✅ Répondu
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => updateStatus(selectedContact._id, "archived")}
                      disabled={selectedContact.status === "archived"}
                      className="cursor-pointer"
                    >
                      📁 Archiver
                    </Button>
                  </div>

                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => deleteContact(selectedContact._id)}
                    className="w-full cursor-pointer"
                  >
                    🗑️ Supprimer
                  </Button>
                </div>
              </Card>
            </div>
          </>
        )}
      </div>

      {showCreationModal && selectedCreation && (
        <CreationModal
          creation={selectedCreation}
          isOpen={showCreationModal}
          onClose={() => {
            setShowCreationModal(false);
            setSelectedCreation(null);
          }}
          hideActions={true}
        />
      )}
    </main>
  );
}
