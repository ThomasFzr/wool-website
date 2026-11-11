import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { loadWithTmpOutbox } from "../../helpers/lib-outbox";

vi.mock("child_process", () => ({ spawn: vi.fn() }));

type Outbox = typeof import("@/lib/emailOutbox");
let outbox: Outbox;
let outboxDir: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const loaded = await loadWithTmpOutbox(() => import("@/lib/emailOutbox"));
  outbox = loaded.mod;
  outboxDir = loaded.outboxDir;
  cleanup = loaded.cleanup;
});

afterAll(() => cleanup());

beforeEach(async () => {
  await rm(outboxDir, { recursive: true, force: true });
});

describe("isEmailPreviewEnabled / isEmailAutoOpenEnabled", () => {
  it("capture par défaut hors production et ouvre l'aperçu", () => {
    vi.stubEnv("EMAIL_TRANSPORT", undefined as any);
    vi.stubEnv("EMAIL_PREVIEW_OPEN", undefined as any);
    expect(outbox.isEmailPreviewEnabled()).toBe(true);
    expect(outbox.isEmailAutoOpenEnabled()).toBe(true);
  });

  it("n'ouvre pas l'aperçu avec EMAIL_PREVIEW_OPEN=0", () => {
    vi.stubEnv("EMAIL_PREVIEW_OPEN", "0");
    expect(outbox.isEmailPreviewEnabled()).toBe(true);
    expect(outbox.isEmailAutoOpenEnabled()).toBe(false);
  });

  it("envoie réellement avec EMAIL_TRANSPORT=resend", () => {
    vi.stubEnv("EMAIL_TRANSPORT", "resend");
    expect(outbox.isEmailPreviewEnabled()).toBe(false);
    expect(outbox.isEmailAutoOpenEnabled()).toBe(false);
  });

  it("ne capture jamais en production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_TRANSPORT", "preview");
    expect(outbox.isEmailPreviewEnabled()).toBe(false);
  });
});

describe("openInBrowser", () => {
  const platform = process.platform;
  const setPlatform = (value: string) => Object.defineProperty(process, "platform", { value });

  function fakeChild() {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    vi.mocked(spawn).mockReturnValue(child as any);
    return child;
  }

  afterAll(() => setPlatform(platform));

  it.each([
    ["darwin", "open", ["http://x"]],
    ["win32", "cmd", ["/c", "start", "", "http://x"]],
    ["linux", "xdg-open", ["http://x"]],
  ])("utilise la commande du système %s", (os, command, args) => {
    setPlatform(os);
    const child = fakeChild();
    outbox.openInBrowser("http://x");
    expect(spawn).toHaveBeenCalledWith(command, args, { stdio: "ignore", detached: true });
    expect(child.unref).toHaveBeenCalled();
  });

  it("journalise une erreur du processus sans la propager", () => {
    setPlatform("linux");
    const child = fakeChild();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    outbox.openInBrowser("http://x");
    child.emit("error", new Error("xdg-open introuvable"));
    expect(error).toHaveBeenCalledWith(expect.any(String), "xdg-open introuvable");
  });

  it("ne propage pas un échec de lancement", () => {
    vi.mocked(spawn).mockImplementation(() => {
      throw new Error("spawn EACCES");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => outbox.openInBrowser("http://x")).not.toThrow();
    expect(error).toHaveBeenCalled();
  });
});

describe("isValidEmailId", () => {
  it("n'accepte que des caractères sûrs", () => {
    expect(outbox.isValidEmailId("2026-11-11T10-00-00-000Z-abcd1234")).toBe(true);
    expect(outbox.isValidEmailId("../secret")).toBe(false);
    expect(outbox.isValidEmailId("a/b")).toBe(false);
    expect(outbox.isValidEmailId("")).toBe(false);
  });
});

describe("captureEmail / listCapturedEmails / readCapturedEmail", () => {
  it("renvoie une liste vide tant qu'aucun email n'a été capturé", async () => {
    expect(await outbox.listCapturedEmails()).toEqual([]);
  });

  it("écrit l'email sur disque et le relit par son id", async () => {
    const captured = await outbox.captureEmail({ to: "a@example.com", subject: "Bienvenue", html: "<p>Hi</p>" });
    expect(outbox.isValidEmailId(captured.id)).toBe(true);
    expect(captured).toMatchObject({ to: "a@example.com", subject: "Bienvenue", html: "<p>Hi</p>" });

    const onDisk = JSON.parse(await readFile(path.join(outboxDir, `${captured.id}.json`), "utf-8"));
    expect(onDisk).toEqual(captured);
    expect(await outbox.readCapturedEmail(captured.id)).toEqual(captured);
  });

  it("liste les emails du plus récent au plus ancien en ignorant les fichiers illisibles", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    const older = await outbox.captureEmail({ to: "a@example.com", subject: "1", html: "" });
    vi.setSystemTime(new Date("2026-01-02T10:00:00Z"));
    const newer = await outbox.captureEmail({ to: "b@example.com", subject: "2", html: "" });
    vi.useRealTimers();

    await writeFile(path.join(outboxDir, "corrompu.json"), "{pas du json");
    await writeFile(path.join(outboxDir, "notes.txt"), "ignoré");

    const list = await outbox.listCapturedEmails();
    expect(list.map((e) => e.id)).toEqual([newer.id, older.id]);
  });

  it("renvoie null pour un id invalide, inconnu ou un fichier corrompu", async () => {
    expect(await outbox.readCapturedEmail("../../etc/passwd")).toBeNull();
    expect(await outbox.readCapturedEmail("inconnu")).toBeNull();
    await mkdir(outboxDir, { recursive: true });
    await writeFile(path.join(outboxDir, "corrompu.json"), "{pas du json");
    expect(await outbox.readCapturedEmail("corrompu")).toBeNull();
  });
});
