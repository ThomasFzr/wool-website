import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

const OUTBOX_DIR = path.join(process.cwd(), ".emails");

export type CapturedEmail = {
  id: string;
  to: string;
  subject: string;
  html: string;
  sentAt: string;
};

/**
 * En local, les emails ne partent pas chez Resend (quota) : ils sont capturés
 * sur disque et consultables sur /dev/emails.
 * Mettre EMAIL_TRANSPORT=resend pour forcer un envoi réel en développement.
 * En production, la capture est toujours désactivée.
 */
export function isEmailPreviewEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return (process.env.EMAIL_TRANSPORT ?? "preview") !== "resend";
}

// Les ids servent de nom de fichier : on n'accepte que des caractères sûrs
// (pas de "/" ni de ".." — aucune traversée de répertoire possible).
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isValidEmailId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export async function captureEmail(email: {
  to: string;
  subject: string;
  html: string;
}): Promise<CapturedEmail> {
  const now = new Date();
  // Préfixe horodaté : le tri alphabétique des fichiers est chronologique
  const id = `${now.toISOString().replace(/[:.]/g, "-")}-${crypto
    .randomBytes(4)
    .toString("hex")}`;

  const captured: CapturedEmail = {
    id,
    to: email.to,
    subject: email.subject,
    html: email.html,
    sentAt: now.toISOString(),
  };

  await mkdir(OUTBOX_DIR, { recursive: true });
  await writeFile(
    path.join(OUTBOX_DIR, `${id}.json`),
    JSON.stringify(captured, null, 2),
    "utf-8"
  );

  return captured;
}

export async function listCapturedEmails(): Promise<CapturedEmail[]> {
  try {
    const files = await readdir(OUTBOX_DIR);
    const emails = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          try {
            return JSON.parse(
              await readFile(path.join(OUTBOX_DIR, f), "utf-8")
            ) as CapturedEmail;
          } catch {
            return null;
          }
        })
    );

    return emails
      .filter((e): e is CapturedEmail => e !== null)
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  } catch {
    // Aucun email capturé pour l'instant
    return [];
  }
}

export async function readCapturedEmail(
  id: string
): Promise<CapturedEmail | null> {
  if (!isValidEmailId(id)) return null;
  try {
    return JSON.parse(
      await readFile(path.join(OUTBOX_DIR, `${id}.json`), "utf-8")
    ) as CapturedEmail;
  } catch {
    return null;
  }
}
