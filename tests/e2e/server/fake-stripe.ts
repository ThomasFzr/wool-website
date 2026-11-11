import http from "http";

/**
 * Faux serveur Stripe pour les tests e2e.
 *
 * Le SDK Stripe du site y est redirigé par STRIPE_API_BASE_URL (lib/stripe.ts).
 * Il implémente les seuls appels faits par le tunnel de paiement, plus une fausse
 * page de paiement (/pay/:id) qui joue le rôle de Stripe Checkout : « Payer » passe la
 * session en payée et renvoie vers success_url, comme le ferait Stripe.
 *
 * Routes de pilotage pour les tests :
 *   POST /__e2e/reset            remet la base dans son état initial et oublie les sessions
 *   GET  /__e2e/sessions         sessions créées (dernière en premier)
 */

type FakeSession = {
  id: string;
  object: "checkout.session";
  status: "open" | "complete" | "expired";
  payment_status: "unpaid" | "paid";
  payment_intent: string | null;
  customer: string | null;
  customer_email: string | null;
  amount_total: number;
  currency: string;
  metadata: Record<string, string>;
  success_url: string;
  cancel_url: string;
  url: string;
  expires_at: number;
  shipping_details: null;
  line_items: { description: string; amount_total: number; quantity: number }[];
};

export async function startFakeStripe(port: number, reset: () => Promise<void>) {
  const base = `http://localhost:${port}`;
  const sessions = new Map<string, FakeSession>();
  let counter = 0;

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", base);
      const body = await readBody(req);
      const route = `${req.method} ${url.pathname}`;
      let match: RegExpMatchArray | null;

      if (route === "POST /__e2e/reset") {
        sessions.clear();
        await reset();
        return json(res, 200, { ok: true });
      }
      if (route === "GET /__e2e/sessions") {
        return json(res, 200, [...sessions.values()].reverse());
      }

      if (route === "POST /v1/checkout/sessions") {
        const form = new URLSearchParams(body);
        const id = `cs_test_e2e_${++counter}_${Date.now()}`;
        const lineItems = collectLineItems(form);
        const session: FakeSession = {
          id,
          object: "checkout.session",
          status: "open",
          payment_status: "unpaid",
          payment_intent: null,
          customer: null,
          customer_email: form.get("customer_email"),
          amount_total: lineItems.reduce((sum, li) => sum + li.amount_total, 0),
          currency: "eur",
          metadata: collectPrefixed(form, "metadata"),
          success_url: form.get("success_url") ?? "",
          cancel_url: form.get("cancel_url") ?? "",
          url: `${base}/pay/${id}`,
          expires_at: Number(form.get("expires_at") ?? 0),
          shipping_details: null,
          line_items: lineItems,
        };
        sessions.set(id, session);
        return json(res, 200, publicSession(session));
      }

      if ((match = url.pathname.match(/^\/v1\/checkout\/sessions\/([^/]+)(\/[a-z_]+)?$/))) {
        const session = sessions.get(decodeURIComponent(match[1]));
        if (!session) return stripeError(res, 404, "No such checkout.session");

        if (req.method === "GET" && !match[2]) return json(res, 200, publicSession(session));
        if (req.method === "GET" && match[2] === "/line_items") {
          return json(res, 200, {
            object: "list",
            has_more: false,
            data: session.line_items.map((li, i) => ({ id: `li_${i}`, object: "item", ...li })),
          });
        }
        if (req.method === "POST" && match[2] === "/expire") {
          if (session.status !== "open") {
            return stripeError(res, 400, `Only Checkout Sessions with a status of open can be expired.`);
          }
          session.status = "expired";
          return json(res, 200, publicSession(session));
        }
      }

      if ((match = url.pathname.match(/^\/v1\/payment_intents\/([^/]+)$/)) && req.method === "GET") {
        return json(res, 200, { id: match[1], object: "payment_intent", status: "succeeded" });
      }

      // Fausse page Stripe Checkout
      if ((match = url.pathname.match(/^\/pay\/([^/]+)$/))) {
        const session = sessions.get(decodeURIComponent(match[1]));
        if (!session) return text(res, 404, "Session inconnue");

        if (req.method === "GET") {
          return html(res, payPage(session));
        }
        if (req.method === "POST") {
          if (session.status !== "open") return text(res, 400, `Session ${session.status}`);
          session.status = "complete";
          session.payment_status = "paid";
          session.payment_intent = `pi_${session.id}`;
          session.customer = "cus_e2e";
          res.writeHead(303, {
            location: session.success_url.replace("{CHECKOUT_SESSION_ID}", session.id),
          });
          return res.end();
        }
      }

      return stripeError(res, 404, `Route non simulée : ${route}`);
    } catch (err) {
      console.error("[fake-stripe]", err);
      return stripeError(res, 500, err instanceof Error ? err.message : "Erreur");
    }
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  return server;
}

function publicSession(session: FakeSession) {
  return { ...session, line_items: undefined };
}

/** Regroupe les champs `prefix[clé]` d'un formulaire Stripe en objet. */
function collectPrefixed(form: URLSearchParams, prefix: string) {
  const out: Record<string, string> = {};
  for (const [key, value] of form) {
    const m = key.match(new RegExp(`^${prefix}\\[([^\\]]+)\\]$`));
    if (m) out[m[1]] = value;
  }
  return out;
}

function collectLineItems(form: URLSearchParams) {
  const items: { description: string; amount_total: number; quantity: number }[] = [];
  for (let i = 0; form.has(`line_items[${i}][price_data][unit_amount]`); i++) {
    const quantity = Number(form.get(`line_items[${i}][quantity]`) ?? 1);
    items.push({
      description: form.get(`line_items[${i}][price_data][product_data][name]`) ?? "",
      amount_total: Number(form.get(`line_items[${i}][price_data][unit_amount]`)) * quantity,
      quantity,
    });
  }
  return items;
}

function payPage(session: FakeSession) {
  const rows = session.line_items
    .map((li) => `<li>${escape(li.description)} — ${(li.amount_total / 100).toFixed(2)} €</li>`)
    .join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Faux Stripe Checkout</title></head>
<body>
  <h1>Faux Stripe Checkout</h1>
  <p data-testid="customer-email">${escape(session.customer_email ?? "")}</p>
  <ul>${rows}</ul>
  <p data-testid="amount-total">Total : ${(session.amount_total / 100).toFixed(2)} €</p>
  <form method="post"><button type="submit">Payer</button></form>
  <a href="${escape(session.cancel_url)}">Annuler</a>
</body></html>`;
}

function escape(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function json(res: http.ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function html(res: http.ServerResponse, body: string) {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}

function text(res: http.ServerResponse, status: number, body: string) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

function stripeError(res: http.ServerResponse, status: number, message: string) {
  json(res, status, { error: { type: "invalid_request_error", message } });
}
