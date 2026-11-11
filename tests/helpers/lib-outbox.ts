import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { vi } from "vitest";

/**
 * lib/emailOutbox calcule son dossier (.emails sous process.cwd()) au chargement :
 * on charge le module avec un cwd temporaire pour ne jamais écrire dans le projet.
 * `load` doit importer (dynamiquement) le module qui dépend de lib/emailOutbox.
 */
export async function loadWithTmpOutbox<T>(load: () => Promise<T>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "outbox-"));
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
  try {
    const mod = await load();
    return { mod, dir, outboxDir: path.join(dir, ".emails"), cleanup: () => rm(dir, { recursive: true, force: true }) };
  } finally {
    cwd.mockRestore();
  }
}
