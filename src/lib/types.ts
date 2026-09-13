export type Product = {
  headline?: string;
  title: string;
  store: "Mercado Livre" | "Shopee" | "Outra";
  url: string;
  price: number;
  oldPrice: number;
  coupon: string;
  details: string;
  image: string;
  copy: string;
};
export type Channel = {
  name: string;
  chatId: string;
  type: string;
  threadId?: number;
  enabled: boolean;
};
export type Doc<T> = {
  id: string;
  owner: string;
  kind: string;
  version: number;
  data: T;
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
  tracking: boolean;
};
export type Settings = {
  publicUrl: string;
  paused: boolean;
  geminiModel: string;
  telegramConfigured: boolean;
  geminiConfigured: boolean;
  storage: string;
  auth: string;
};
export type Dashboard = {
  products: Doc<Product>[];
  channels: Doc<Channel>[];
  jobs: Doc<Job>[];
  settings: Settings;
  analytics: {
    clicks: number;
    bots: number;
    unique: number;
    days: { day: string; count: number }[];
    byJob: { id: string; title: string; channel: string; clicks: number }[];
    devices: { name: string; count: number }[];
  };
};
