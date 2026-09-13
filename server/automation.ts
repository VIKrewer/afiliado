import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { Service } from "./service";
import { Sources } from "./sources";
import {
  Candidate,
  Run,
  Workflow,
  filterOffer,
  orderedNodes,
  withinWindow,
  workflowSchema,
} from "./automation-domain";
import { Doc } from "./domain";
import { z } from "zod";

@Injectable()
export class Automation {
  private busy = false;
  private publishing = new Set<string>();
  private timer?: NodeJS.Timeout;
  constructor(
    private readonly service: Service,
    private readonly sources: Sources,
  ) {}
  async onModuleInit() {
    for (const run of await this.service.store.list<Run>("run"))
      if (run.data.state === "running") {
        run.data.state = "interrupted";
        run.data.finished = new Date().toISOString();
        run.data.error =
          "Servidor reiniciado. Publicações já criadas permanecem na fila.";
        await this.service.store.update(run);
      }
    for (const flow of await this.service.store.list<Workflow>("workflow"))
      if (flow.data.running) {
        flow.data.running = false;
        await this.service.store.update(flow);
      }
    this.timer = setInterval(
      () =>
        void this.tick().catch(() =>
          console.error("Automação: não foi possível consultar fluxos."),
        ),
      5000,
    );
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async list(owner: string) {
    const [workflows, runs, candidates] = await Promise.all([
      this.service.store.list<Workflow>("workflow", owner),
      this.service.store.list<Run>("run", owner),
      this.service.store.list<Candidate>("candidate", owner),
    ]);
    return {
      workflows,
      runs: runs
        .sort((a, b) => b.data.started.localeCompare(a.data.started))
        .slice(0, 50),
      candidates: candidates
        .sort((a, b) => b.data.created.localeCompare(a.data.created))
        .slice(0, 100)
        .map((c) => ({
          ...c,
          data: { ...c.data, offer: { ...c.data.offer, image: "" } },
        })),
    };
  }
  async save(owner: string, input: unknown, id?: string) {
    const parsed = workflowSchema.parse(input);
    try {
      orderedNodes(parsed);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (parsed.enabled && parsed.autoPublish && !parsed.channelIds.length)
      throw new BadRequestException(
        "Selecione ao menos um destino para ativar publicação automática.",
      );
    for (const channel of parsed.channelIds) {
      const row = await this.service.store.get(channel, owner);
      if (!row || row.kind !== "channel")
        throw new BadRequestException("Destino inválido.");
    }
    const old = id ? await this.service.store.get<Workflow>(id, owner) : null;
    if (id && (!old || old.kind !== "workflow")) throw new NotFoundException();
    if (old?.data.running)
      throw new ConflictException(
        "Espere a execução atual terminar para alterar o fluxo.",
      );
    const doc: Doc<Workflow> = {
      id: id || randomUUID(),
      owner,
      kind: "workflow",
      version: old?.version || 0,
      data: {
        ...parsed,
        nextRun:
          old?.data.nextRun || new Date(Date.now() + 60000).toISOString(),
        lastRun: old?.data.lastRun,
        running: false,
      },
    };
    if (old) {
      if (!(await this.service.store.update(doc)))
        throw new ConflictException("Fluxo foi alterado em outra sessão.");
    } else await this.service.store.insert(doc);
    return doc;
  }
  async remove(owner: string, id: string) {
    const flow = await this.service.store.get<Workflow>(id, owner);
    if (!flow || flow.kind !== "workflow") throw new NotFoundException();
    if (flow.data.running)
      throw new ConflictException("Aguarde a execução terminar.");
    await this.service.store.remove(id, owner);
    return { ok: true };
  }
  async start(owner: string, id: string, preview = true) {
    const flow = await this.service.store.get<Workflow>(id, owner);
    if (!flow || flow.kind !== "workflow") throw new NotFoundException();
    if (flow.data.running)
      throw new ConflictException("Este fluxo já está executando.");
    if (!preview && !withinWindow(flow.data))
      throw new BadRequestException(
        "Fora da janela de publicação configurada.",
      );
    flow.data.running = true;
    flow.data.lastRun = new Date().toISOString();
    flow.data.nextRun = new Date(
      Date.now() + flow.data.intervalMinutes * 60000,
    ).toISOString();
    if (!(await this.service.store.update(flow)))
      throw new ConflictException("Outra execução já iniciou.");
    const run: Doc<Run> = {
      id: randomUUID(),
      owner,
      kind: "run",
      version: 0,
      data: {
        workflowId: id,
        workflowName: flow.data.name,
        state: "running",
        preview,
        started: new Date().toISOString(),
        found: 0,
        accepted: 0,
        queued: 0,
        logs: [],
      },
    };
    try {
      await this.service.store.insert(run);
    } catch (e) {
      const current = await this.service.store.get<Workflow>(id, owner);
      if (current) {
        current.data.running = false;
        await this.service.store.update(current);
      }
      throw e;
    }
    void this.execute(flow, run).catch(() =>
      console.error("Execução interrompida por erro de persistência."),
    );
    return { runId: run.id };
  }
  async log(run: Doc<Run>, step: string, message: string) {
    run.data.logs.push({ step, message, at: new Date().toISOString() });
    if (run.data.logs.length > 150) run.data.logs.shift();
    if (await this.service.store.update(run)) run.version++;
  }
  async execute(flow: Doc<Workflow>, run: Doc<Run>) {
    const store = this.service.store;
    try {
      const nodes = orderedNodes(flow.data);
      let offers = await this.sources.discover(flow.owner, nodes[0]);
      run.data.found = offers.length;
      await this.log(
        run,
        "source",
        `${offers.length} produtos recebidos da fonte.`,
      );
      const used = await this.dailyUsage(flow);
      const room = run.data.preview
        ? flow.data.maxPerRun
        : Math.max(
            0,
            Math.min(flow.data.maxPerRun, flow.data.dailyLimit - used),
          );
      if (!room) {
        await this.log(run, "limit", "Limite diário atingido.");
        offers = [];
      }
      const seen = new Set<string>();
      let processed = 0;
      for (let offer of offers) {
        if (processed >= room) break;
        const fingerprint = createHash("sha256")
          .update(`${flow.id}:${nodes[0].config.provider}:${offer.sourceId}`)
          .digest("hex");
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        const old = await store.get<{ at: string }>(
          `seen-${fingerprint}`,
          flow.owner,
        );
        if (
          old &&
          Date.now() - Date.parse(old.data.at) <
            flow.data.cooldownHours * 3600000
        ) {
          await this.log(
            run,
            "dedupe",
            `${offer.title}: já publicado no período.`,
          );
          continue;
        }
        let rejected = "";
        const candidateId = createHash("sha256")
          .update(`${flow.owner}:${flow.id}:${offer.sourceId}`)
          .digest("hex")
          .slice(0, 32);
        try {
          for (const node of nodes.slice(1)) {
            if (node.kind === "filter") {
              rejected = filterOffer(offer, node);
              if (rejected) break;
            }
            if (node.kind === "enrich")
              offer = await this.sources.enrich(
                offer,
                node.config.fetchPage !== false,
              );
            if (node.kind === "copy") {
              const result = await this.service.generate(flow.owner, offer, {
                ...(node.config.style ? { style: node.config.style } : {}),
                ...(node.config.instructions
                  ? { customPrompt: node.config.instructions }
                  : {}),
              });
              offer = {
                ...offer,
                copy: result.copy,
                headline: result.headline,
              };
            }
          }
          if (rejected) {
            await this.log(run, "filter", `${offer.title}: ${rejected}.`);
            continue;
          }
          processed++;
          run.data.accepted++;
          // Even without an enrichment node, download source image before publishing.
          if (!offer.image && offer.imageUrl)
            offer = await this.sources.enrich(offer, false);
          const candidate: Doc<Candidate> = {
            id: `candidate-${candidateId}`,
            owner: flow.owner,
            kind: "candidate",
            version: 0,
            data: {
              workflowId: flow.id,
              runId: run.id,
              offer,
              status: "review",
              created: new Date().toISOString(),
            },
          };
          const previous = await store.get<Candidate>(candidate.id, flow.owner);
          if (previous) {
            candidate.version = previous.version;
            if (!(await store.update(candidate)))
              throw new ConflictException("Oferta mudou durante a execução.");
          } else await store.insert(candidate);
          if (!run.data.preview && flow.data.autoPublish) {
            const fresh = await store.get<Workflow>(flow.id, flow.owner);
            if (
              !fresh?.data.enabled ||
              (await this.service.settings(flow.owner)).data.paused
            ) {
              await this.log(
                run,
                "publish",
                "Envio automático pausado; oferta ficou para revisão.",
              );
              continue;
            }
            const jobs = await this.publishCandidate(flow.owner, candidate.id);
            run.data.queued += jobs.ids.length;
            await this.log(
              run,
              "publish",
              `${offer.title}: ${jobs.ids.length} destino(s) enfileirado(s).`,
            );
          } else
            await this.log(
              run,
              "review",
              `${offer.title}: pronto para revisar${run.data.preview ? " (teste sem envio)" : ""}.`,
            );
        } catch (error) {
          await this.log(
            run,
            "error",
            `${offer.title}: ${error instanceof Error ? error.message : "Falha ao processar"}`,
          );
          run.data.state = "partial";
        }
      }
      if (run.data.state === "running") run.data.state = "success";
    } catch (error) {
      run.data.state = "failed";
      run.data.error =
        error instanceof Error ? error.message : "Falha na execução";
    } finally {
      run.data.finished = new Date().toISOString();
      await store.update(run);
      const current = await store.get<Workflow>(flow.id, flow.owner);
      if (current) {
        current.data.running = false;
        await store.update(current);
      }
    }
  }
  async publishCandidate(owner: string, id: string) {
    const c = await this.service.store.get<Candidate>(id, owner);
    if (!c || c.kind !== "candidate") throw new NotFoundException();
    if (c.data.status === "queued") return { ids: c.data.jobIds || [] };
    if (!c.data.offer.affiliateVerified)
      throw new BadRequestException("A fonte não forneceu link comissionado.");
    const flow = await this.service.store.get<Workflow>(
      c.data.workflowId,
      owner,
    );
    if (!flow) throw new NotFoundException("Fluxo não encontrado.");
    if (this.publishing.has(flow.id))
      throw new ConflictException(
        "Outra oferta deste fluxo está sendo enfileirada. Tente novamente.",
      );
    this.publishing.add(flow.id);
    try {
      if ((await this.dailyUsage(flow)) >= flow.data.dailyLimit)
        throw new BadRequestException("Limite diário de ofertas atingido.");
      if (Date.now() - Date.parse(c.data.offer.observedAt) > 86400000)
        throw new BadRequestException(
          "Oferta com mais de 24 horas. Execute o fluxo novamente para atualizar preço e disponibilidade.",
        );
      const product = await this.service.saveProduct(owner, c.data.offer);
      // UUID derived from candidate + run: retries use exactly the same delivery IDs.
      const hex = createHash("sha256")
        .update(`${id}:${c.data.runId}`)
        .digest("hex");
      const requestId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
      const jobs = await this.service.enqueue(owner, {
        productId: product.id,
        channelIds: flow.data.channelIds,
        requestId,
        tracking: flow.data.tracking,
      });
      c.data.status = "queued";
      c.data.jobIds = jobs.ids;
      if (!(await this.service.store.update(c)))
        throw new ConflictException(
          "Envios criados, mas a oferta mudou. Atualize antes de tentar novamente.",
        );
      const at = new Date().toISOString();
      const fingerprint = createHash("sha256")
        .update(
          `${flow.id}:${orderedNodes(flow.data)[0].config.provider}:${c.data.offer.sourceId}`,
        )
        .digest("hex");
      const old = await this.service.store.get(`seen-${fingerprint}`, owner);
      const mark = {
        id: `seen-${fingerprint}`,
        owner,
        kind: "seen",
        version: old?.version || 0,
        data: { at },
      };
      if (old) await this.service.store.update(mark);
      else await this.service.store.insert(mark);
      await this.service.store.insert({
        id: `publication-${hex}`,
        owner,
        kind: "seen",
        version: 0,
        data: { at, workflowId: flow.id, publication: true },
      });
      return jobs;
    } finally {
      this.publishing.delete(flow.id);
    }
  }
  async editCandidate(owner: string, id: string, input: unknown) {
    const values = z
      .object({
        headline: z.string().trim().max(65),
        copy: z.string().trim().max(500),
      })
      .parse(input);
    const c = await this.service.store.get<Candidate>(id, owner);
    if (!c || c.kind !== "candidate") throw new NotFoundException();
    const flow = await this.service.store.get<Workflow>(
      c.data.workflowId,
      owner,
    );
    if (
      c.data.status !== "review" ||
      flow?.data.running ||
      this.publishing.has(c.data.workflowId)
    )
      throw new ConflictException(
        "Aguarde a execução ou publicação terminar para editar.",
      );
    c.data.offer = { ...c.data.offer, ...values };
    if (!(await this.service.store.update(c)))
      throw new ConflictException("Oferta alterada em outra sessão.");
    return { ok: true };
  }
  async dailyUsage(flow: Doc<Workflow>) {
    const format = new Intl.DateTimeFormat("en-CA", {
      timeZone: flow.data.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const today = format.format(new Date());
    return (
      await this.service.store.list<{
        at: string;
        workflowId?: string;
        publication?: boolean;
      }>("seen", flow.owner)
    ).filter(
      (r) =>
        r.data.publication &&
        r.data.workflowId === flow.id &&
        format.format(new Date(r.data.at)) === today,
    ).length;
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (const flow of await this.service.store.list<Workflow>("workflow"))
        if (
          flow.data.enabled &&
          !flow.data.running &&
          Date.parse(flow.data.nextRun || "1970-01-01") <= Date.now() &&
          withinWindow(flow.data) &&
          !(await this.service.settings(flow.owner)).data.paused
        ) {
          await this.start(flow.owner, flow.id, false);
          break;
        }
    } finally {
      this.busy = false;
    }
  }
}
