import { beforeAll, describe, expect, it } from "vitest";
import { connectToDatabase } from "@/lib/db";
import robots from "@/app/robots";
import sitemap, { revalidate } from "@/app/sitemap";
import { SITE_URL } from "@/lib/site";
import { createCreation } from "../../helpers/creations-fixtures";

describe("robots.txt", () => {
  it("bloque les pages privées avec ou sans slash final et annonce le sitemap canonique", () => {
    const { rules, sitemap: sitemapUrl } = robots();
    const disallow = (Array.isArray(rules) ? rules[0] : rules).disallow;
    expect(disallow).toEqual(expect.arrayContaining(["/admin", "/account", "/cart", "/checkout"]));
    expect(sitemapUrl).toBe("https://www.maillemum.fr/sitemap.xml");
  });
});

describe("sitemap", () => {
  beforeAll(async () => {
    await connectToDatabase();
  });

  it("est régénéré toutes les heures", () => {
    expect(revalidate).toBe(3600);
  });

  it("liste les créations visibles sur l'adresse canonique (www)", async () => {
    await createCreation({ slug: "bonnet-rose" });
    await createCreation({ slug: "cache", hidden: true });
    const urls = (await sitemap()).map((e) => e.url);
    expect(SITE_URL).toBe("https://www.maillemum.fr");
    expect(urls).toEqual([SITE_URL, `${SITE_URL}/contact`, `${SITE_URL}/creations/bonnet-rose`]);
  });
});
