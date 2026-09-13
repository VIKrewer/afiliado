import { Injectable, BadRequestException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { load } from "cheerio";
import { z } from "zod";
import { Service } from "./service";
import { FlowNode, Offer } from "./automation-domain";
import { imageFile, productSchema, publicUrl } from "./domain";
import { safeDownload } from "./http";

export function shopeeAuthorization(
  appId: string,
  secret: string,
  payload: string,
  timestamp: number,
) {
  const signature = createHash("sha256")
    .update(`${appId}${timestamp}${payload}${secret}`)
    .digest("hex");
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`;
}
const rowSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  title: z.string().min(3).max(180),
  url: z.string().url(),
  affiliateUrl: z.string().url(),
  price: z.coerce.number().positive(),
  oldPrice: z.coerce.number().nonnegative().optional(),
  imageUrl: z.string().url().optional(),
  description: z.string().max(1600).optional(),
  coupon: z.string().max(80).optional(),
  store: z.enum(["Shopee", "Mercado Livre", "Outra"]).default("Outra"),
});
export function normalizeFeed(input: unknown): Offer[] {
  const rows = z.object({ products: z.array(rowSchema).max(500) }).parse(input);
  return rows.products.map((r) => {
    const url = publicUrl(r.affiliateUrl),
      oldPrice = r.oldPrice && r.oldPrice > r.price ? r.oldPrice : 0;
    return {
      ...productSchema.parse({
        title: r.title,
        store: r.store,
        url,
        price: r.price,
        oldPrice,
        coupon: r.coupon || "",
        details: r.description || "",
      }),
      sourceId: r.id,
      sourceUrl: publicUrl(r.url),
      imageUrl: r.imageUrl ? publicUrl(r.imageUrl) : "",
      observedAt: new Date().toISOString(),
      discountPercent: oldPrice
        ? Math.round((1 - r.price / oldPrice) * 100)
        : 0,
      affiliateVerified: true,
    };
  });
}
@Injectable()
export class Sources {
  constructor(private readonly service: Service) {}
  async shopee(owner: string, query: string) {
    const s = await this.service.settings(owner),
      appId = this.service.credential(s, "SHOPEE_APP_ID"),
      secret = this.service.credential(s, "SHOPEE_SECRET");
    if (!appId || !secret)
      throw new BadRequestException(
        "Conecte App ID e Secret da Open API de Afiliados Shopee em Fontes.",
      );
    const payload = JSON.stringify({ query });
    const r = await fetch("https://open-api.affiliate.shopee.com.br/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: shopeeAuthorization(
          appId,
          secret,
          payload,
          Math.floor(Date.now() / 1000),
        ),
      },
      body: payload,
      signal: AbortSignal.timeout(25000),
    }).catch(() => {
      throw new BadRequestException("Shopee não respondeu dentro do prazo.");
    });
    const data = await r.json();
    if (!r.ok || data.errors?.length)
      throw new BadRequestException(
        "Shopee recusou a consulta. Verifique credenciais, permissão productOfferV2 e cota no portal oficial.",
      );
    return data.data;
  }
  async discover(owner: string, node: FlowNode): Promise<Offer[]> {
    if (node.config.provider === "feed") {
      if (!node.config.feedUrl)
        throw new BadRequestException(
          "Informe a URL HTTPS do feed JSON de ofertas.",
        );
      const token = this.service.credential(
        await this.service.settings(owner),
        "FEED_TOKEN",
      );
      const response = await safeDownload(
        node.config.feedUrl,
        2_000_000,
        token ? { Authorization: `Bearer ${token}` } : {},
      );
      const offers = normalizeFeed(JSON.parse(response.bytes.toString("utf8")));
      const keyword = (node.config.keyword || "").toLowerCase();
      return offers
        .filter(
          (o) =>
            !keyword ||
            `${o.title} ${o.details}`.toLowerCase().includes(keyword),
        )
        .slice(0, 50);
    }
    const keyword = node.config.keyword || "";
    const data = await this.shopee(
      owner,
      `{ productOfferV2(keyword: ${JSON.stringify(keyword)}, limit: 30, page: 1) { nodes { itemId productName productLink offerLink imageUrl priceMin priceMax priceDiscountRate } } }`,
    );
    const offers: Offer[] = [];
    for (const row of data.productOfferV2?.nodes || []) {
      const parsed = productSchema.safeParse({
        title: row.productName,
        store: "Shopee",
        url: row.offerLink,
        price: Number(row.priceMin),
        details: "",
        oldPrice: 0,
      });
      if (!parsed.success || !row.productLink) continue;
      offers.push({
        ...parsed.data,
        sourceId: String(row.itemId),
        sourceUrl: publicUrl(row.productLink),
        imageUrl: row.imageUrl ? publicUrl(row.imageUrl) : "",
        observedAt: new Date().toISOString(),
        discountPercent: Number(row.priceDiscountRate) || 0,
        affiliateVerified: true,
      });
    }
    return offers;
  }
  async enrich(offer: Offer, fetchPage = true) {
    let result = { ...offer };
    if (fetchPage) {
      try {
        const page = await safeDownload(offer.sourceUrl);
        const $ = load(page.bytes.toString("utf8"));
        let description = "";
        $('script[type="application/ld+json"]').each((_i, el) => {
          try {
            const raw = JSON.parse($(el).text());
            const candidates = Array.isArray(raw)
              ? raw
              : [raw, ...(raw["@graph"] || [])];
            const p = candidates.find(
              (v: Record<string, unknown>) =>
                v["@type"] === "Product" ||
                (Array.isArray(v["@type"]) && v["@type"].includes("Product")),
            );
            if (p) {
              description =
                typeof p.description === "string" ? p.description : description;
              const image = Array.isArray(p.image) ? p.image[0] : p.image;
              if (!result.imageUrl && typeof image === "string")
                result.imageUrl = new URL(image, offer.sourceUrl).href;
            }
          } catch {}
        });
        const clean = load(
          description ||
            $('meta[property="og:description"]').attr("content") ||
            $('meta[name="description"]').attr("content") ||
            "",
        )
          .text()
          .trim();
        if (clean) result.details = clean.slice(0, 1600);
        if (!result.imageUrl) {
          const img = $('meta[property="og:image"]').attr("content");
          if (img) result.imageUrl = new URL(img, offer.sourceUrl).href;
        }
      } catch {
        /* Public pages may block automation. Keep authenticated feed data; never invent specs. */
      }
    }
    if (result.imageUrl && !result.image) {
      const image = await safeDownload(result.imageUrl, 5 * 1024 * 1024);
      const mime = image.type.split(";")[0];
      const value = `data:${mime};base64,${image.bytes.toString("base64")}`;
      imageFile(value);
      result = { ...result, image: value };
    }
    return result;
  }
}
