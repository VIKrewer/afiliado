import { z } from "zod";

export function publicUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !url.hostname.includes(".") ||
    /(^|\.)(localhost|local|internal)$/.test(url.hostname) ||
    /^[\d.:\[\]]+$/.test(url.hostname)
  )
    throw new Error("Use um link HTTPS público.");
  return url.toString();
}
const link = z
  .string()
  .max(3000)
  .refine((v) => {
    try {
      publicUrl(v);
      return true;
    } catch {
      return false;
    }
  }, "Use um link HTTPS público.");
export const productSchema = z
  .object({
    title: z.string().trim().min(3).max(180),
    store: z.enum(["Mercado Livre", "Shopee", "Outra"]),
    url: link,
    price: z.number().positive().max(1000000),
    oldPrice: z.number().nonnegative().max(1000000).default(0),
    coupon: z.string().trim().max(80).default(""),
    details: z.string().trim().max(1600).default(""),
    image: z.string().max(7_000_000).default(""),
    copy: z.string().trim().max(500).default(""),
    headline: z.string().trim().max(65).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.oldPrice && v.oldPrice < v.price)
      ctx.addIssue({
        code: "custom",
        path: ["oldPrice"],
        message: "O preço anterior deve ser maior que o atual.",
      });
  });
export type Product = z.infer<typeof productSchema>;
export type Channel = {
  name: string;
  chatId: string;
  type: string;
  threadId?: number;
  enabled: boolean;
};
export type Job = {
  productId: string;
  channelId: string;
  product: Product;
  channel: Channel;
  state: "queued" | "sending" | "sent" | "failed" | "uncertain" | "cancelled";
  due: string;
  created: string;
  attempts: number;
  error?: string;
  sentAt?: string;
  messageId?: number;
  trackUrl: string;
  campaignId: string;
  tracking: boolean;
};
export type Click = {
  jobId: string;
  at: string;
  visitor: string;
  bot: boolean;
  device: string;
  referrer: string;
};
export type Settings = {
  publicUrl: string;
  paused: boolean;
  geminiModel: string;
  secrets?: string;
};
export type Doc<T> = {
  id: string;
  owner: string;
  kind: string;
  version: number;
  data: T;
};
export const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const escapeHtml = (v: string) =>
  v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
export function caption(p: Product) {
  const lines = [
    ...(p.headline ? [`<b>${escapeHtml(p.headline)}</b>`, ""] : []),
    `<b>${escapeHtml(p.title)}</b>`,
    "",
    ...(p.copy ? [escapeHtml(p.copy), ""] : []),
    ...(p.oldPrice > p.price ? [`De <s>${money(p.oldPrice)}</s>`] : []),
    `<b>Por ${money(p.price)}</b>`,
    ...(p.coupon ? [`Cupom: <code>${escapeHtml(p.coupon)}</code>`] : []),
    "",
    `${escapeHtml(p.store)} · Preço sujeito a alteração.`,
    "Publicidade · Link de afiliado.",
  ];
  return lines.join("\n");
}
export function imageFile(
  value: string,
): { bytes: Buffer; mime: string } | null {
  if (!value) return null;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
    value,
  );
  if (!match) throw new Error("Envie uma imagem JPG, PNG ou WebP.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 5 * 1024 * 1024 || bytes.length < 12)
    throw new Error("A foto deve ter até 5 MB.");
  const valid =
    match[1] === "jpeg"
      ? bytes[0] === 255 && bytes[1] === 216
      : match[1] === "png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP";
  if (!valid)
    throw new Error("O conteúdo da imagem não corresponde ao formato.");
  return { bytes, mime: `image/${match[1]}` };
}
