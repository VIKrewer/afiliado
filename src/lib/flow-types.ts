import type { Channel, Doc, Product } from "./types";
export type FlowNode = {
  id: string;
  kind: "source" | "filter" | "enrich" | "copy" | "publish";
  position: { x: number; y: number };
  config: {
    provider?: "shopee" | "feed";
    keyword?: string;
    feedUrl?: string;
    minDiscount?: number;
    maxPrice?: number;
    include?: string;
    exclude?: string;
    requireImage?: boolean;
    fetchPage?: boolean;
    style?: "resenha" | "gamer" | "direto" | "premium";
    instructions?: string;
  };
};
export type Workflow = {
  name: string;
  enabled: boolean;
  intervalMinutes: number;
  maxPerRun: number;
  dailyLimit: number;
  cooldownHours: number;
  timezone: string;
  startHour: number;
  endHour: number;
  autoPublish: boolean;
  tracking: boolean;
  channelIds: string[];
  nodes: FlowNode[];
  edges: { id: string; source: string; target: string }[];
  nextRun?: string;
  lastRun?: string;
  running?: boolean;
};
export type Run = {
  workflowId: string;
  workflowName: string;
  state: string;
  preview: boolean;
  started: string;
  finished?: string;
  found: number;
  accepted: number;
  queued: number;
  logs: { step: string; message: string; at: string }[];
  error?: string;
};
export type Candidate = {
  workflowId: string;
  runId: string;
  offer: Product & {
    sourceUrl: string;
    imageUrl: string;
    observedAt: string;
    discountPercent: number;
  };
  status: string;
  created: string;
};
export type AutomationData = {
  workflows: Doc<Workflow>[];
  runs: Doc<Run>[];
  candidates: Doc<Candidate>[];
};
export type Api = <T = unknown>(
  path: string,
  method?: string,
  body?: unknown,
) => Promise<T>;
export type FlowProps = { api: Api; channels: Doc<Channel>[] };
export type Preferences = {
  workspaceName: string;
  accent: "terracotta" | "forest" | "ocean" | "violet";
  density: "comfortable" | "compact";
  widgets: ("metrics" | "offers" | "chart" | "actions")[];
  style: "resenha" | "gamer" | "direto" | "premium";
  audience: string;
  customPrompt: string;
  examples: string;
};
export const defaultPreferences: Preferences = {
  workspaceName: "Minha operação",
  accent: "terracotta",
  density: "comfortable",
  widgets: ["metrics", "offers", "chart", "actions"],
  style: "resenha",
  audience: "Pessoas buscando bons achados, sem enrolação",
  customPrompt: "",
  examples:
    "TECLADIN TOP PRA TU JOGAR\nUM ACHADINHO PRA DEIXAR TUA MESA NO JEITO",
};
export const stageLabels: Record<FlowNode["kind"], string> = {
  source: "Buscar ofertas",
  filter: "Filtrar oportunidades",
  enrich: "Detalhes e foto",
  copy: "Escrever com IA",
  publish: "Publicar no Telegram",
};
export function newWorkflow(): Workflow {
  const kinds: FlowNode["kind"][] = [
    "source",
    "filter",
    "enrich",
    "copy",
    "publish",
  ];
  return {
    name: "Achadinhos no automático",
    enabled: false,
    intervalMinutes: 60,
    maxPerRun: 3,
    dailyLimit: 20,
    cooldownHours: 48,
    timezone: "America/Sao_Paulo",
    startHour: 8,
    endHour: 22,
    autoPublish: false,
    tracking: false,
    channelIds: [],
    nodes: kinds.map((kind, i) => ({
      id: `step-${i}`,
      kind,
      position: { x: [0,275,275,0,0][i], y: [0,0,170,170,340][i] },
      config:
        kind === "source"
          ? { provider: "shopee", keyword: "teclado" }
          : kind === "filter"
            ? { minDiscount: 15, maxPrice: 500, requireImage: true }
            : kind === "enrich"
              ? { fetchPage: true }
              : kind === "copy"
                ? { style: "gamer", instructions: "" }
                : {},
    })),
    edges: kinds.slice(1).map((_, i) => ({
      id: `edge-${i}`,
      source: `step-${i}`,
      target: `step-${i + 1}`,
    })),
  };
}
