import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  HttpException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { Store } from "./store";
import { Vault } from "./vault";
import {
  caption,
  Channel,
  Click,
  Doc,
  imageFile,
  Job,
  Product,
  productSchema,
  publicUrl,
  Settings,
} from "./domain";
import { z } from "zod";
import { Preferences, preferencesSchema, writingPrompt } from "./preferences";

class TelegramError extends HttpException {
  constructor(
    message: string,
    readonly retryAfter?: number,
    readonly uncertain = false,
  ) {
    super(message, 502);
  }
}
@Injectable()
export class Service {
  readonly store = new Store();
  readonly vault = new Vault();
  private working = false;
  private timer?: NodeJS.Timeout;
  async onModuleInit() {
    const admin = await this.store.get<Settings>("system-env-owner");
    if (admin && !process.env.SUPABASE_ADMIN_USER_ID)
      process.env.SUPABASE_ADMIN_USER_ID = admin.owner;
    // A crash between Telegram accepting and our commit is ambiguous: never blindly resend.
    for (const job of await this.store.list<Job>("job"))
      if (job.data.state === "sending") {
        job.data.state = "uncertain";
        job.data.error =
          "O servidor reiniciou durante o envio. Confira o Telegram antes de reenviar.";
        await this.store.update(job);
      }
    this.timer = setInterval(
      () =>
        void this.tick().catch(() =>
          console.error("Worker: falha no banco; retomará no próximo ciclo."),
        ),
      2000,
    );
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async claimLocalOwner(owner: string) {
    if (
      process.env.SUPABASE_ADMIN_USER_ID ||
      process.env.NODE_ENV === "production"
    )
      return;
    const doc: Doc<Settings> = {
      id: "system-env-owner",
      owner,
      kind: "settings",
      version: 0,
      data: { publicUrl: "", paused: false, geminiModel: "gemini-3.6-flash" },
    };
    if (await this.store.insert(doc))
      process.env.SUPABASE_ADMIN_USER_ID = owner;
    else {
      const existing = await this.store.get<Settings>(doc.id);
      if (existing) process.env.SUPABASE_ADMIN_USER_ID = existing.owner;
    }
  }
  async settings(owner: string): Promise<Doc<Settings>> {
    return (
      (await this.store.get<Settings>(`settings-${owner}`, owner)) || {
        id: `settings-${owner}`,
        owner,
        kind: "settings",
        version: 0,
        data: {
          publicUrl: process.env.PUBLIC_APP_URL || "",
          paused: false,
          geminiModel: process.env.GEMINI_MODEL || "gemini-3.6-flash",
        },
      }
    );
  }
  secrets(doc: Doc<Settings>) {
    return this.vault.decrypt(doc.data.secrets);
  }
  credential(doc: Doc<Settings>, key: string) {
    const secrets = this.secrets(doc);
    return (
      secrets[key] ||
      (doc.owner === "local" || doc.owner === process.env.SUPABASE_ADMIN_USER_ID
        ? process.env[key] || ""
        : "")
    );
  }
  async settingsView(owner: string) {
    const s = await this.settings(owner);
    return {
      publicUrl: s.data.publicUrl,
      paused: s.data.paused,
      geminiModel: s.data.geminiModel,
      telegramConfigured: !!this.credential(s, "TELEGRAM_BOT_TOKEN"),
      geminiConfigured: !!this.credential(s, "GEMINI_API_KEY"),
      storage: this.store.supabase ? "Supabase" : "Banco local",
      auth: this.store.supabase ? "supabase" : "local",
    };
  }
  async saveSettings(owner: string, input: unknown) {
    const body = z
      .object({
        publicUrl: z.string().max(500),
        paused: z.boolean(),
        geminiModel: z
          .string()
          .regex(/^[a-zA-Z0-9.-]+$/)
          .max(80),
        telegramToken: z.string().max(200).optional(),
        geminiKey: z.string().max(200).optional(),
      })
      .parse(input);
    if (body.publicUrl)
      body.publicUrl = publicUrl(body.publicUrl).replace(/\/$/, "");
    const s = await this.settings(owner);
    const secrets = this.secrets(s);
    if (body.telegramToken) {
      if (!/^\d+:[A-Za-z0-9_-]+$/.test(body.telegramToken))
        throw new BadRequestException("Token do Telegram inválido.");
      secrets.TELEGRAM_BOT_TOKEN = body.telegramToken;
    }
    if (body.geminiKey) secrets.GEMINI_API_KEY = body.geminiKey;
    s.data = {
      publicUrl: body.publicUrl,
      paused: body.paused,
      geminiModel: body.geminiModel,
      secrets: this.vault.encrypt(secrets),
    };
    if (!(await this.store.insert(s)) && !(await this.store.update(s)))
      throw new ConflictException(
        "Configuração alterada em outra sessão. Atualize e tente de novo.",
      );
    return this.settingsView(owner);
  }
  async tg(
    owner: string,
    method: string,
    body: Record<string, unknown> | FormData = {},
  ) {
    const token = this.credential(
      await this.settings(owner),
      "TELEGRAM_BOT_TOKEN",
    );
    if (!token)
      throw new BadRequestException(
        "Configure o token do Telegram em Integrações.",
      );
    let response: Response;
    try {
      response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        ...(body instanceof FormData
          ? { body }
          : {
              body: JSON.stringify(body),
              headers: { "Content-Type": "application/json" },
            }),
        signal: AbortSignal.timeout(25000),
      });
    } catch {
      throw new TelegramError(
        "Sem confirmação do Telegram. Confira o destino antes de reenviar.",
        undefined,
        true,
      );
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new TelegramError(
        "Resposta inválida do Telegram. Confira o destino.",
        undefined,
        true,
      );
    }
    if (!result.ok)
      throw new TelegramError(
        response.status === 401
          ? "Token recusado pelo Telegram."
          : response.status === 403
            ? "O bot não pode publicar nesse destino. Verifique permissões ou bloqueio."
            : response.status === 429
              ? "Limite de envio: aguardando o Telegram."
              : "Telegram recusou a operação. Confira o chat ID, tópico, foto e permissões.",
        result.parameters?.retry_after,
        response.status >= 500,
      );
    return result.result;
  }
  async bot(owner: string) {
    const me = await this.tg(owner, "getMe");
    return { username: me.username, name: me.first_name };
  }
  async discover(owner: string) {
    const hook = await this.tg(owner, "getWebhookInfo");
    if (hook.url)
      throw new BadRequestException(
        "Esse bot usa um webhook em outro serviço. Cadastre o chat ID manualmente; o webhook foi preservado.",
      );
    const updates = await this.tg(owner, "getUpdates", {
      limit: 100,
      timeout: 0,
    });
    const chats = new Map<string, Channel>();
    for (const update of updates) {
      const chat =
        update.message?.chat ||
        update.channel_post?.chat ||
        update.my_chat_member?.chat;
      if (chat)
        chats.set(String(chat.id), {
          name: chat.title || chat.first_name || String(chat.id),
          chatId: String(chat.id),
          type: chat.type,
          enabled: true,
        });
    }
    return [...chats.values()];
  }
  async saveChannel(owner: string, input: unknown) {
    const b = z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(100),
        chatId: z.string().regex(/^(-?\d+|@[a-zA-Z0-9_]{5,})$/),
        threadId: z.number().int().positive().optional(),
        enabled: z.boolean().default(true),
      })
      .parse(input);
    const chat = await this.tg(owner, "getChat", { chat_id: b.chatId });
    const me = await this.tg(owner, "getMe");
    if (chat.type !== "private") {
      const member = await this.tg(owner, "getChatMember", {
        chat_id: chat.id,
        user_id: me.id,
      });
      if (
        ["left", "kicked"].includes(member.status) ||
        (chat.type === "channel" &&
          !(
            member.status === "creator" ||
            (member.status === "administrator" && member.can_post_messages)
          ))
      )
        throw new BadRequestException(
          "Adicione o bot ao destino e habilite a permissão para publicar.",
        );
    }
    const existing = b.id ? await this.store.get<Channel>(b.id, owner) : null;
    if (b.id && !existing) throw new NotFoundException();
    const duplicates = await this.store.list<Channel>("channel", owner);
    if (
      duplicates.some(
        (d) =>
          d.id !== b.id &&
          d.data.chatId === String(chat.id) &&
          d.data.threadId === b.threadId,
      )
    )
      throw new ConflictException("Destino já cadastrado.");
    const doc: Doc<Channel> = {
      id: b.id || randomUUID(),
      owner,
      kind: "channel",
      version: existing?.version || 0,
      data: {
        name: b.name,
        chatId: String(chat.id),
        threadId: b.threadId,
        enabled: b.enabled,
        type: chat.type,
      },
    };
    if (existing) {
      if (!(await this.store.update(doc))) throw new ConflictException();
    } else await this.store.insert(doc);
    return doc;
  }
  async saveProduct(owner: string, input: unknown, id?: string) {
    const p = productSchema.parse(input);
    imageFile(p.image);
    const old = id ? await this.store.get<Product>(id, owner) : null;
    if (id && (!old || old.kind !== "product")) throw new NotFoundException();
    const doc: Doc<Product> = {
      id: id || randomUUID(),
      owner,
      kind: "product",
      version: old?.version || 0,
      data: p,
    };
    if (old) {
      if (!(await this.store.update(doc)))
        throw new ConflictException("Outra sessão alterou esta oferta.");
    } else await this.store.insert(doc);
    return doc;
  }
  async preferences(owner: string) {
    const p = await this.store.get<Preferences>(`preferences-${owner}`, owner);
    return preferencesSchema.parse(p?.data || {});
  }
  async savePreferences(owner: string, input: unknown) {
    const data = preferencesSchema.parse(input);
    data.widgets = [...new Set(data.widgets)];
    const old = await this.store.get<Preferences>(
      `preferences-${owner}`,
      owner,
    );
    const doc: Doc<Preferences> = {
      id: `preferences-${owner}`,
      owner,
      kind: "preferences",
      version: old?.version || 0,
      data,
    };
    if (old) {
      if (!(await this.store.update(doc))) throw new ConflictException();
    } else await this.store.insert(doc);
    return data;
  }
  async saveSourceCredentials(owner: string, input: unknown) {
    const b = z
      .object({
        shopeeAppId: z.string().max(100).optional(),
        shopeeSecret: z.string().max(300).optional(),
        feedToken: z.string().max(500).optional(),
      })
      .parse(input);
    const s = await this.settings(owner),
      secrets = this.secrets(s);
    if (b.shopeeAppId) secrets.SHOPEE_APP_ID = b.shopeeAppId;
    if (b.shopeeSecret) secrets.SHOPEE_SECRET = b.shopeeSecret;
    if (b.feedToken) secrets.FEED_TOKEN = b.feedToken;
    s.data.secrets = this.vault.encrypt(secrets);
    if (!(await this.store.insert(s)) && !(await this.store.update(s)))
      throw new ConflictException();
    return this.sourceStatus(owner);
  }
  async sourceStatus(owner: string) {
    const s = await this.settings(owner);
    return {
      shopeeConfigured:
        !!this.credential(s, "SHOPEE_APP_ID") &&
        !!this.credential(s, "SHOPEE_SECRET"),
      feedTokenConfigured: !!this.credential(s, "FEED_TOKEN"),
    };
  }
  async generate(
    owner: string,
    input: unknown,
    override: Partial<Preferences> = {},
  ) {
    const p = productSchema.parse(input),
      s = await this.settings(owner),
      key = this.credential(s, "GEMINI_API_KEY");
    if (!key)
      throw new BadRequestException("Configure a chave Gemini em Integrações.");
    const globalPreferences=await this.preferences(owner);
    const preferences = preferencesSchema.parse({
      ...globalPreferences,
      ...override,
    });
    if(override.customPrompt)preferences.customPrompt=[globalPreferences.customPrompt,override.customPrompt].filter(Boolean).join('\n');
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${s.data.geminiModel}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: writingPrompt(preferences) }] },
          contents: [
            {
              parts: [
                {
                  text: JSON.stringify({
                    title: p.title,
                    details: p.details,
                    store: p.store,
                  }),
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.85,
            maxOutputTokens: 1800,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(45000),
      },
    ).catch(() => {
      throw new BadRequestException("Gemini não respondeu. Tente novamente.");
    });
    if (!response.ok)
      throw new BadRequestException(
        response.status === 429
          ? "Cota Gemini atingida. Confira seu plano."
          : "Gemini recusou a geração. Confira chave e modelo.",
      );
    const data = await response.json();
    const text = (data.candidates?.[0]?.content?.parts || [])
      .filter((p: { thought?: boolean }) => !p.thought)
      .map((p: { text?: string }) => p.text || "")
      .join("")
      .trim();
    try {
      const content = JSON.parse(
        text.replace(/^```(?:json)?\s*|```$/g, ""),
      );
      return z
        .object({
          headline: z.string().min(1).max(65),
          copy: z.string().min(1).max(500),
        })
        .parse(content);
    } catch {
      throw new BadRequestException(
        "A IA retornou texto fora do formato. Tente gerar novamente.",
      );
    }
  }
  async enqueue(owner: string, input: unknown) {
    const b = z
      .object({
        productId: z.string().uuid(),
        channelIds: z.array(z.string().uuid()).min(1).max(30),
        scheduledAt: z.string().datetime().optional(),
        requestId: z.string().uuid(),
        tracking: z.boolean().default(true),
      })
      .parse(input);
    const p = await this.store.get<Product>(b.productId, owner);
    if (!p || p.kind !== "product")
      throw new NotFoundException("Produto não encontrado.");
    const s = await this.settings(owner);
    if (b.tracking && !s.data.publicUrl)
      throw new BadRequestException(
        "Configure a URL pública HTTPS ou desmarque o tracking para testar com seu link direto.",
      );
    if (!this.credential(s, "TELEGRAM_BOT_TOKEN"))
      throw new BadRequestException("Configure o bot primeiro.");
    const due = b.scheduledAt || new Date().toISOString();
    if (b.scheduledAt && Date.parse(due) < Date.now())
      throw new BadRequestException("Escolha uma data futura.");
    const selected: Doc<Channel>[] = [];
    for (const id of new Set(b.channelIds)) {
      const c = await this.store.get<Channel>(id, owner);
      if (!c || c.kind !== "channel" || !c.data.enabled)
        throw new BadRequestException("Destino inexistente ou desativado.");
      selected.push(c);
    }
    const results = [];
    for (const channel of selected) {
      const id = createHash("sha256")
        .update(`${owner}:${b.requestId}:${channel.id}`)
        .digest("hex")
        .slice(0, 32);
      const job: Doc<Job> = {
        id,
        owner,
        kind: "job",
        version: 0,
        data: {
          productId: p.id,
          channelId: channel.id,
          product: p.data,
          channel: channel.data,
          state: "queued",
          due,
          created: new Date().toISOString(),
          attempts: 0,
          campaignId: b.requestId,
          tracking: b.tracking,
          trackUrl: b.tracking ? `${s.data.publicUrl}/r/${id}` : p.data.url,
        },
      };
      await this.store.insert(job);
      results.push(id);
    }
    return { ids: results };
  }
  async cancel(owner: string, id: string) {
    const j = await this.store.get<Job>(id, owner);
    if (!j || j.kind !== "job") throw new NotFoundException();
    if (j.data.state !== "queued")
      throw new ConflictException(
        "Só é possível cancelar um envio que ainda está na fila.",
      );
    j.data.state = "cancelled";
    if (!(await this.store.update(j)))
      throw new ConflictException("O envio já começou.");
    return { ok: true };
  }
  async retry(owner: string, id: string, confirmed: boolean) {
    const j = await this.store.get<Job>(id, owner);
    if (!j || j.kind !== "job") throw new NotFoundException();
    if (!["failed", "uncertain"].includes(j.data.state))
      throw new ConflictException("Esse envio não pode ser repetido.");
    if (j.data.state === "uncertain" && !confirmed)
      throw new BadRequestException(
        "Confirme que verificou o Telegram para evitar duplicação.",
      );
    j.data.state = "queued";
    j.data.due = new Date().toISOString();
    j.data.attempts = 0;
    j.data.error = undefined;
    if (!(await this.store.update(j))) throw new ConflictException();
    return { ok: true };
  }
  async tick() {
    if (this.working) return;
    this.working = true;
    try {
      const jobs = (await this.store.list<Job>("job"))
        .filter(
          (j) =>
            j.data.state === "queued" && Date.parse(j.data.due) <= Date.now(),
        )
        .sort((a, b) => a.data.due.localeCompare(b.data.due));
      for (const j of jobs) {
        if ((await this.settings(j.owner)).data.paused) continue;
        const c = await this.store.get<Channel>(j.data.channelId, j.owner);
        if (!c?.data.enabled) {
          j.data.state = "cancelled";
          j.data.error = "Destino removido ou desativado.";
          await this.store.update(j);
          continue;
        }
        j.data.state = "sending";
        j.data.attempts++;
        if (!(await this.store.update(j))) continue;
        j.version++;
        try {
          const fields = {
            chat_id: j.data.channel.chatId,
            ...(j.data.channel.threadId
              ? { message_thread_id: j.data.channel.threadId }
              : {}),
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [[{ text: "Ver oferta", url: j.data.trackUrl }]],
            },
          };
          const file = imageFile(j.data.product.image);
          let result;
          if (file) {
            const form = new FormData();
            for (const [k, v] of Object.entries(fields))
              form.append(
                k,
                typeof v === "object" ? JSON.stringify(v) : String(v),
              );
            form.append("caption", caption(j.data.product));
            form.append(
              "photo",
              new Blob([new Uint8Array(file.bytes)], { type: file.mime }),
              "oferta." + file.mime.split("/")[1],
            );
            result = await this.tg(j.owner, "sendPhoto", form);
          } else
            result = await this.tg(j.owner, "sendMessage", {
              ...fields,
              text: caption(j.data.product),
              link_preview_options: { is_disabled: true },
            });
          j.data.state = "sent";
          j.data.messageId = result.message_id;
          j.data.sentAt = new Date().toISOString();
          j.data.error = undefined;
        } catch (error) {
          if (
            error instanceof TelegramError &&
            error.retryAfter &&
            j.data.attempts < 5
          ) {
            j.data.state = "queued";
            j.data.due = new Date(
              Date.now() + Math.max(3, error.retryAfter) * 1000,
            ).toISOString();
          } else
            j.data.state =
              error instanceof TelegramError && error.uncertain
                ? "uncertain"
                : "failed";
          j.data.error =
            error instanceof Error ? error.message : "Falha no envio.";
        }
        // If this write fails, state stays sending: recovery marks it uncertain, never duplicates.
        if (!(await this.store.update(j)))
          throw new Error("Falha ao confirmar estado do envio.");
        break;
      }
    } finally {
      this.working = false;
    }
  }
  async track(
    id: string,
    visitor: string,
    agent: string,
    referer: string,
    head = false,
  ) {
    const j = await this.store.get<Job>(id);
    if (!j || j.kind !== "job")
      throw new NotFoundException("Link não encontrado.");
    const url = publicUrl(j.data.product.url);
    if (!head) {
      const bot =
        /bot|crawler|spider|preview|telegram|facebookexternalhit|headless/i.test(
          agent,
        );
      let referrer = "";
      try {
        referrer = new URL(referer).hostname;
      } catch {}
      const data: Click = {
        jobId: id,
        at: new Date().toISOString(),
        visitor: this.vault.fingerprint(`${j.owner}:${visitor}`),
        bot,
        device: /mobile|android|iphone/i.test(agent)
          ? "Celular"
          : "Computador / outro",
        referrer,
      };
      try {
        await this.store.insert({
          id: randomUUID(),
          owner: j.owner,
          kind: "click",
          version: 0,
          data,
        });
      } catch {
        console.error(
          "Tracking: clique não persistido; redirecionamento mantido.",
        );
      }
    }
    return url;
  }
  async dashboard(owner: string) {
    const [products, channels, jobs, clicks, settings] = await Promise.all([
      this.store.list<Product>("product", owner),
      this.store.list<Channel>("channel", owner),
      this.store.list<Job>("job", owner),
      this.store.list<Click>("click", owner),
      this.settingsView(owner),
    ]);
    const human = clicks.filter((c) => !c.data.bot);
    return {
      products,
      channels,
      jobs: jobs
        .map((j) => ({
          ...j,
          data: { ...j.data, product: { ...j.data.product, image: "" } },
        }))
        .sort((a, b) => b.data.created.localeCompare(a.data.created)),
      settings,
      analytics: {
        clicks: human.length,
        bots: clicks.length - human.length,
        unique: new Set(human.map((c) => c.data.visitor)).size,
        days: Array.from({ length: 7 }, (_, i) => {
          const day = new Date(Date.now() - (6 - i) * 86400000)
            .toISOString()
            .slice(0, 10);
          return {
            day,
            count: human.filter((c) => c.data.at.startsWith(day)).length,
          };
        }),
        byJob: jobs.map((j) => ({
          id: j.id,
          title: j.data.product.title,
          channel: j.data.channel.name,
          clicks: human.filter((c) => c.data.jobId === j.id).length,
        })),
        devices: ["Celular", "Computador / outro"].map((name) => ({
          name,
          count: human.filter((c) => c.data.device === name).length,
        })),
      },
    };
  }
}
