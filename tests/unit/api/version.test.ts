import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { readJson } from "../../helpers/http";
import { asAdmin, asAnonymous, asUser } from "../../helpers/session";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));
vi.mock("child_process", () => ({ execSync: vi.fn() }));
vi.mock("fs", () => ({ readFileSync: vi.fn() }));

const exec = vi.mocked(execSync);
const readFile = vi.mocked(readFileSync);

type GitAnswers = Record<string, string | Error>;

/** Simule git : chaque commande renvoie sa sortie ou lève l'erreur fournie. */
function fakeGit(answers: GitAnswers) {
  exec.mockImplementation(((cmd: string) => {
    const answer = answers[cmd];
    if (answer === undefined || answer instanceof Error) throw answer ?? new Error(`inattendu: ${cmd}`);
    return answer;
  }) as any);
}

const LOCAL_GIT: GitAnswers = {
  "git rev-parse HEAD": "abcdef1234567890\n",
  "git rev-parse --short HEAD": "abcdef1\n",
  "git log -1 --format=%ci": "2026-03-01 10:00:00 +0100\n",
  "git log -1 --format=%s": "feat: bonnet\n",
  "git rev-parse --abbrev-ref HEAD": "main\n",
  "git log -1 --format=%an": "Maman\n",
  "git describe --tags --exact-match HEAD 2>/dev/null": "v1.2.0\n",
};

// Le module met en cache les infos de version : on le recharge à chaque test
async function get() {
  const { GET } = await import("@/app/api/version/route");
  return readJson(await GET());
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
  vi.stubEnv("VERCEL_GIT_COMMIT_MESSAGE", "");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "");
  vi.stubEnv("VERCEL_GIT_COMMIT_AUTHOR_NAME", "");
  vi.stubEnv("VERCEL_GIT_COMMIT_AUTHOR_LOGIN", "");
  vi.stubEnv("VERCEL_GIT_COMMIT_DATE", "");
  vi.stubEnv("NODE_ENV", "development");
  readFile.mockReturnValue(JSON.stringify({ version: "1.4.2" }));
  asAnonymous();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/version — contrôle d'accès", () => {
  it("refuse un visiteur en production Vercel", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const { status, body } = await get();
    expect(status).toBe(403);
    expect(body.error).toMatch(/administrateurs/);
  });

  it("refuse un utilisateur non admin en production hors Vercel", async () => {
    vi.stubEnv("NODE_ENV", "production");
    asUser();
    expect((await get()).status).toBe(403);
  });

  it("répond à l'admin en production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "1234567890abcdef");
    vi.stubEnv("VERCEL_GIT_COMMIT_DATE", "2026-01-02T03:04:05Z");
    fakeGit({});
    asAdmin();
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.nodeEnv).toBe("production");
  });

  it("ne contrôle pas l'accès en preview Vercel même si NODE_ENV vaut production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    fakeGit(LOCAL_GIT);
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.nodeEnv).toBe("staging");
  });
});

describe("GET /api/version — informations Git locales", () => {
  it("lit la version et les informations du dernier commit", async () => {
    fakeGit(LOCAL_GIT);
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body).toMatchObject({
      version: "1.4.2",
      nodeEnv: "development",
      git: {
        commit: "abcdef1234567890",
        shortCommit: "abcdef1",
        date: "2026-03-01T09:00:00.000Z",
        message: "feat: bonnet",
        branch: "main",
        author: "Maman",
        tag: "v1.2.0",
      },
    });
    expect(typeof body.timestamp).toBe("string");
  });

  it("met les informations en cache entre deux appels", async () => {
    fakeGit(LOCAL_GIT);
    const { GET } = await import("@/app/api/version/route");
    await GET();
    const calls = exec.mock.calls.length;
    const second = await readJson(await GET());
    expect(second.body.git.commit).toBe("abcdef1234567890");
    expect(exec.mock.calls.length).toBe(calls);
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it("utilise « unknown » si package.json n'a pas de version", async () => {
    readFile.mockReturnValue("{}");
    fakeGit(LOCAL_GIT);
    expect((await get()).body.version).toBe("unknown");
  });

  it("se rabat sur git describe en HEAD détachée, sans tag", async () => {
    fakeGit({
      ...LOCAL_GIT,
      "git rev-parse --abbrev-ref HEAD": new Error("détachée"),
      "git describe --tags --exact-match HEAD 2>/dev/null || git describe --all HEAD": "heads/feature\n",
      "git describe --tags --exact-match HEAD 2>/dev/null": new Error("pas de tag"),
    });
    const { body } = await get();
    expect(body.git.branch).toBe("heads/feature");
    expect(body.git.tag).toBeUndefined();
  });

  it("indique « detached » si aucune branche n'est trouvée et ignore un tag vide", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-05T05:05:05.000Z"));
    fakeGit({
      ...LOCAL_GIT,
      "git log -1 --format=%ci": "\n",
      "git rev-parse --abbrev-ref HEAD": new Error("détachée"),
      "git describe --tags --exact-match HEAD 2>/dev/null || git describe --all HEAD": new Error("rien"),
      "git describe --tags --exact-match HEAD 2>/dev/null": "\n",
    });
    const { body } = await get();
    expect(body.git.branch).toBe("detached");
    expect(body.git.tag).toBeUndefined();
    // Date de commit vide : on retombe sur la date courante
    expect(body.git.date).toBe("2026-05-05T05:05:05.000Z");
  });

  it("renvoie git: null quand git est indisponible", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fakeGit({});
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.git).toBeNull();
  });

  it("indique development quand ni VERCEL_ENV ni NODE_ENV ne sont définis", async () => {
    vi.stubEnv("NODE_ENV", "");
    fakeGit(LOCAL_GIT);
    expect((await get()).body.nodeEnv).toBe("development");
  });
});

describe("GET /api/version — variables Vercel", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "fedcba9876543210");
  });

  it("utilise les variables Vercel fournies", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_MESSAGE", "fix: panier");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "staging");
    vi.stubEnv("VERCEL_GIT_COMMIT_AUTHOR_NAME", "Thomas");
    vi.stubEnv("VERCEL_GIT_COMMIT_DATE", "2026-02-02T12:00:00Z");
    fakeGit({ "git describe --tags --exact-match HEAD 2>/dev/null": "v2.0.0\n" });
    const { body } = await get();
    expect(body).toMatchObject({
      nodeEnv: "staging",
      git: {
        commit: "fedcba9876543210",
        shortCommit: "fedcba9",
        message: "fix: panier",
        branch: "staging",
        author: "Thomas",
        date: "2026-02-02T12:00:00.000Z",
        tag: "v2.0.0",
      },
    });
  });

  it("applique les valeurs de repli et le login de l'auteur", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_AUTHOR_LOGIN", "thomasfzr");
    fakeGit({ "git log -1 --format=%ci": "2026-04-04 08:00:00 +0000\n" });
    const { body } = await get();
    expect(body.git).toMatchObject({
      message: "N/A",
      branch: "unknown",
      author: "thomasfzr",
      date: "2026-04-04T08:00:00.000Z",
    });
    expect(body.git.tag).toBeUndefined();
  });

  it("utilise « unknown » sans auteur et la date courante si git ne donne rien", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-06T06:06:06.000Z"));
    fakeGit({ "git log -1 --format=%ci": "  \n", "git describe --tags --exact-match HEAD 2>/dev/null": "" });
    const { body } = await get();
    expect(body.git.author).toBe("unknown");
    expect(body.git.date).toBe("2026-06-06T06:06:06.000Z");
    expect(body.git.tag).toBeUndefined();
  });

  it("utilise la date courante si git est indisponible", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-07T07:07:07.000Z"));
    fakeGit({});
    const { body } = await get();
    expect(body.git.date).toBe("2026-07-07T07:07:07.000Z");
  });

  it("remplace une date Vercel invalide par la date courante", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-08T08:08:08.000Z"));
    vi.stubEnv("VERCEL_GIT_COMMIT_DATE", "pas une date");
    fakeGit({});
    const { body } = await get();
    expect(body.git.date).toBe("2026-08-08T08:08:08.000Z");
  });
});

describe("GET /api/version — erreurs", () => {
  it("répond 500 si package.json est illisible", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    readFile.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const { status, body } = await get();
    expect(status).toBe(500);
    expect(body).toEqual({ error: "Impossible de récupérer les informations de version", version: "unknown" });
  });
});
