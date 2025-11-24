"use client";

import { useState } from "react";
import { ProfileForm } from "@/components/ProfileForm";

type User = {
  name?: string | null;
  email: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  emailNotifications: boolean;
  provider: string;
};

export default function AccountClient({ user }: { user: User }) {
  const [key, setKey] = useState(0);

  const handleUpdate = () => {
    // Force un re-render en changeant la clé
    setKey((prev) => prev + 1);
    // Recharger la page pour obtenir les nouvelles données
    window.location.reload();
  };

  return <ProfileForm key={key} user={user} onUpdate={handleUpdate} />;
}
