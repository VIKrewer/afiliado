import { z } from "zod";
import { Product } from "./domain";

export const nodeSchema = z.object({
  id: z.string().min(1).max(60),
  kind: z.enum(["source", "filter", "enrich", "copy", "publish"]),
  position: z.object({ x: z.number(), y: z.number() }),
  config: z
    .object({
      provider: z.enum(["shopee", "feed"]).optional(),
      keyword: z.string().max(160).optional(),
      feedUrl: z.string().max(2000).optional(),
      minDiscount: z.number().min(0).max(100).optional(),
      maxPrice: z.number().nonnegative().optional(),
      include: z.string().max(300).optional(),
      exclude: z.string().max(300).optional(),
      requireImage: z.boolean().optional(),
      fetchPage: z.boolean().optional(),
      style: z.enum(["resenha", "gamer", "direto", "premium"]).optional(),
      instructions: z.string().max(1800).optional(),
    })
    .default({}),
});
export const workflowSchema = z.object({
  name: z.string().trim().min(3).max(100),
  enabled: z.boolean().default(false),
  intervalMinutes: z.number().int().min(15).max(10080).default(60),
  maxPerRun: z.number().int().min(1).max(10).default(3),
  dailyLimit: z.number().int().min(1).max(100).default(20),
  cooldownHours: z.number().int().min(1).max(720).default(48),
  timezone: z
    .string()
    .default("America/Sao_Paulo")
    .refine((v) => {
      try {
        new Intl.DateTimeFormat("pt-BR", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }),
  startHour: z.number().int().min(0).max(23).default(8),
  endHour: z.number().int().min(0).max(23).default(22),
  autoPublish: z.boolean().default(false),
  tracking: z.boolean().default(true),
  channelIds: z.array(z.string().uuid()).max(30).default([]),
  nodes: z.array(nodeSchema).min(2).max(12),
  edges: z
    .array(
      z.object({
        id: z.string().max(80),
        source: z.string(),
        target: z.string(),
      }),
    )
    .max(12),
});
export type FlowNode = z.infer<typeof nodeSchema>;
export type Workflow = z.infer<typeof workflowSchema> & {
  nextRun?: string;
  lastRun?: string;
  running?: boolean;
};
export type Offer = Product & {
  sourceId: string;
  sourceUrl: string;
  imageUrl: string;
  observedAt: string;
  discountPercent: number;
  affiliateVerified: boolean;
};
export type Candidate = {
  workflowId: string;
  runId: string;
  offer: Offer;
  status: "review" | "queued" | "rejected";
  reason?: string;
  created: string;
  jobIds?: string[];
};
export type Run = {
  workflowId: string;
  workflowName: string;
  state: "running" | "success" | "partial" | "failed" | "interrupted";
  preview: boolean;
  started: string;
  finished?: string;
  found: number;
  accepted: number;
  queued: number;
  logs: { step: string; message: string; at: string }[];
  error?: string;
};
export function orderedNodes(flow: Workflow) {
  const map = new Map(flow.nodes.map((n) => [n.id, n]));
  if (map.size !== flow.nodes.length)
    throw new Error("IDs de etapas duplicados.");
  const sources = flow.nodes.filter((n) => n.kind === "source"),
    ends = flow.nodes.filter((n) => n.kind === "publish");
  if (sources.length !== 1 || ends.length !== 1)
    throw new Error("O fluxo deve ter uma fonte e uma saída de publicação.");
  const ordered: FlowNode[] = [];
  let current: FlowNode | undefined = sources[0];
  for (const e of flow.edges)
    if (!map.has(e.source) || !map.has(e.target))
      throw new Error("Conexão aponta para etapa inexistente.");
  while (current) {
    if (ordered.some((n) => n.id === current!.id))
      throw new Error("Ciclos não são permitidos.");
    ordered.push(current);
    const edges = flow.edges.filter((e) => e.source === current!.id);
    if (edges.length > 1)
      throw new Error(
        "Este editor executa um caminho sequencial; use um fluxo separado para outra ramificação.",
      );
    current = edges[0] ? map.get(edges[0].target) : undefined;
  }
  if (
    ordered.length !== flow.nodes.length ||
    ordered.at(-1)?.kind !== "publish" ||
    flow.edges.length !== flow.nodes.length - 1
  )
    throw new Error("Conecte todas as etapas, da fonte até a publicação.");
  if (!ordered.some((n) => n.kind === "copy"))
    throw new Error("Inclua uma etapa de texto antes de publicar.");
  return ordered;
}
export function filterOffer(offer: Offer, node: FlowNode) {
  const c = node.config,
    text = `${offer.title} ${offer.details}`.toLowerCase();
  if (c.maxPrice && offer.price > c.maxPrice) return "Preço acima do limite";
  if (c.minDiscount && offer.discountPercent < c.minDiscount)
    return "Desconto abaixo do mínimo";
  const includes = (c.include || "")
    .toLowerCase()
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const excludes = (c.exclude || "")
    .toLowerCase()
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (includes.length && !includes.some((v) => text.includes(v)))
    return "Fora das palavras desejadas";
  if (excludes.some((v) => text.includes(v))) return "Palavra bloqueada";
  if (c.requireImage && !offer.imageUrl && !offer.image) return "Sem foto";
  return "";
}
export function withinWindow(flow: Workflow, now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: flow.timezone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  return (
    flow.startHour === flow.endHour ||
    (flow.startHour < flow.endHour
      ? hour >= flow.startHour && hour < flow.endHour
      : hour >= flow.startHour || hour < flow.endHour)
  );
}
