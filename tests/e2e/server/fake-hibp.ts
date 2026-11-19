import crypto from "crypto";
import http from "http";

/**
 * Faux serveur « Pwned Passwords » (Have I Been Pwned) pour les tests e2e.
 *
 * Le site y est redirigé par HIBP_API_BASE_URL (lib/hibp.ts) : aucun test n'interroge la
 * vraie API. Même format de réponse que l'API : « SUFFIXE:COMPTE » par ligne, pour le
 * préfixe de 5 caractères demandé.
 *
 * Routes de pilotage pour les tests :
 *   POST /__e2e/hibp    { pwned?: string[], down?: boolean } : mots de passe compromis,
 *                       ou API en panne (503)
 *   POST /__e2e/reset   revient à l'état initial (DEFAULT_PWNED, API disponible)
 */

/** Mots de passe compromis par défaut. */
export const DEFAULT_PWNED = ["password123", "azertyuiop", "motdepasse"];

const sha1 = (text: string) => crypto.createHash("sha1").update(text).digest("hex").toUpperCase();

export async function startFakeHibp(port: number) {
  let pwned = new Set(DEFAULT_PWNED.map(sha1));
  let down = false;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const route = `${req.method} ${url.pathname}`;

    if (route === "POST /__e2e/reset") {
      pwned = new Set(DEFAULT_PWNED.map(sha1));
      down = false;
      return send(res, 200, "ok");
    }
    if (route === "POST /__e2e/hibp") {
      const body = JSON.parse((await readBody(req)) || "{}") as { pwned?: string[]; down?: boolean };
      if (body.pwned) pwned = new Set(body.pwned.map(sha1));
      if (body.down !== undefined) down = body.down;
      return send(res, 200, "ok");
    }

    const match = route.match(/^GET \/range\/([0-9A-F]{5})$/i);
    if (match) {
      if (down) return send(res, 503, "Service Unavailable");
      const prefix = match[1].toUpperCase();
      const lines = [...pwned].filter((h) => h.startsWith(prefix)).map((h) => `${h.slice(5)}:1234`);
      // Une ligne de padding, comme avec l'en-tête Add-Padding
      lines.push(`${"0".repeat(35)}:0`);
      return send(res, 200, lines.join("\r\n"));
    }
    return send(res, 404, `Route inconnue : ${route}`);
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  return server;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function send(res: http.ServerResponse, status: number, body: string) {
  res.writeHead(status, { "content-type": "text/plain" });
  res.end(body);
}
