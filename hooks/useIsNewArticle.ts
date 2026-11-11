import { useEffect, useState } from "react";

const NEW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Badge « Nouveau » : article marqué nouveau, rendu visible (visibleAt, sinon createdAt)
 * il y a moins de 7 jours. L'heure n'est lue qu'après le montage : la page servie depuis
 * le cache (ISR) a été rendue plus tôt, et comparer à l'heure pendant le rendu donnait un
 * HTML différent côté serveur et côté navigateur (erreur d'hydratation).
 */
export function useIsNewArticle(showAsNew: boolean | undefined, refDate: string | Date | undefined | null): boolean {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  if (!showAsNew) return false;
  if (!refDate) return true;
  if (now === null) return false;
  return now - new Date(refDate).getTime() < NEW_DAYS * DAY_MS;
}
