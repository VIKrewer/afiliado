const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve, sep } = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const directory = mkdtempSync(join(tmpdir(), "afiliado-automation-"));
process.env.DATABASE_FILE = join(directory, "test.sqlite");
process.env.SETTINGS_ENCRYPTION_KEY = "cd".repeat(32);
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { Service } = require("../dist-api/service");
const { Automation } = require("../dist-api/automation");
const {
  Sources,
  normalizeFeed,
  shopeeAuthorization,
} = require("../dist-api/sources");
const { isPublicAddress, safeDownload } = require("../dist-api/http");
const {
  workflowSchema,
  orderedNodes,
  filterOffer,
  withinWindow,
} = require("../dist-api/automation-domain");
const { preferencesSchema, writingPrompt } = require("../dist-api/preferences");
const service = new Service();
const offers = () =>
  normalizeFeed({
    products: [
      {
        id: "keyboard-1",
        title: "Teclado mecânico RGB ABNT2",
        store: "Shopee",
        url: "https://shopee.com.br/keyboard",
        affiliateUrl: "https://shopee.com.br/keyboard?affiliate_id=real",
        price: 149,
        oldPrice: 199,
        description: "USB, ABNT2, RGB",
      },
    ],
  });
let sourceCalls = 0;
const sources = {
  discover: async () => {
    sourceCalls++;
    return offers();
  },
  enrich: async (offer) => offer,
};
service.generate = async () => ({
  headline: "TECLADIN PRA TU JOGAR",
  copy: "USB, RGB e layout ABNT2 pra deixar o setup no jeito.",
});
const engine = new Automation(service, sources);
after(() => {
  engine.onModuleDestroy();
  service.onModuleDestroy();
  service.store.close();
  if (resolve(directory).startsWith(resolve(tmpdir()) + sep))
    rmSync(directory, { recursive: true, force: true });
});
function base() {
  const kinds = ["source", "filter", "enrich", "copy", "publish"];
  return workflowSchema.parse({
    name: "Setup gamer",
    enabled: true,
    autoPublish: true,
    tracking: false,
    startHour: 0,
    endHour: 0,
    nodes: kinds.map((kind, i) => ({
      id: String(i),
      kind,
      position: { x: i * 250, y: 0 },
      config:
        i === 0
          ? { provider: "feed", feedUrl: "https://feed.example.com/offers" }
          : i === 1
            ? { minDiscount: 10 }
            : {},
    })),
    edges: kinds
      .slice(1)
      .map((_, i) => ({
        id: String(i),
        source: String(i),
        target: String(i + 1),
      })),
  });
}
async function fixture(overrides = {}) {
  const owner = randomUUID();
  await service.saveSettings(owner,{publicUrl:'',paused:false,geminiModel:'gemini-3.6-flash',telegramToken:'123:fake-test-only'});
  const channel = {
    id: randomUUID(),
    owner,
    version: 0,
    kind: "channel",
    data: {
      name: "Canal QA",
      chatId: "-100123",
      type: "supergroup",
      enabled: true,
    },
  };
  await service.store.insert(channel);
  const flow = await engine.save(owner, {
    ...base(),
    channelIds: [channel.id],
    ...overrides,
  });
  return { owner, flow };
}
async function run(flow, preview) {
  const r = {
    id: randomUUID(),
    owner: flow.owner,
    kind: "run",
    version: 0,
    data: {
      workflowId: flow.id,
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
  await service.store.insert(r);
  await engine.execute(flow, r);
  return (await service.store.get(r.id, flow.owner)).data;
}
test("grafo executa conexões reais e rejeita ciclo, ramificação e etapa desconectada", () => {
  const f = base();
  f.nodes.reverse();
  assert.deepEqual(
    orderedNodes(f).map((n) => n.id),
    ["0", "1", "2", "3", "4"],
  );
  assert.throws(() =>
    orderedNodes({
      ...f,
      edges: [...f.edges, { id: "cycle", source: "4", target: "0" }],
    }),
  );
  assert.throws(() =>
    orderedNodes({
      ...f,
      edges: [...f.edges, { id: "branch", source: "0", target: "2" }],
    }),
  );
  assert.throws(() => orderedNodes({ ...f, edges: f.edges.slice(1) }));
});
test("regras de desconto, preço, palavras e imagem", () => {
  const offer = offers()[0];
  const node = { config: { minDiscount: 30 } };
  assert.match(filterOffer(offer, node), /Desconto/);
  assert.match(filterOffer(offer, { config: { maxPrice: 100 } }), /Preço/);
  assert.match(filterOffer(offer, { config: { exclude: "rgb" } }), /bloqueada/);
  assert.match(filterOffer(offer, { config: { requireImage: true } }), /foto/);
  assert.equal(filterOffer(offer, { config: { include: "ABNT2" } }), "");
});
test("janela horária respeita fuso e atravessa meia-noite", () => {
  const f = { ...base(), startHour: 22, endHour: 6 };
  assert.equal(withinWindow(f, new Date("2026-09-13T02:00:00Z")), true);
  assert.equal(withinWindow(f, new Date("2026-09-13T15:00:00Z")), false);
});
test("fonte exige link afiliado e não inventa preço anterior", () => {
  assert.throws(() =>
    normalizeFeed({
      products: [
        {
          id: 1,
          title: "Teclado",
          price: 10,
          url: "https://shopee.com.br/item",
        },
      ],
    }),
  );
  const [o] = normalizeFeed({
    products: [
      {
        id: 1,
        title: "Teclado",
        price: 10,
        url: "https://shopee.com.br/item",
        affiliateUrl: "https://shopee.com.br/link",
      },
    ],
  });
  assert.equal(o.oldPrice, 0);
  assert.equal(o.discountPercent, 0);
});
test("assinatura Shopee usa bytes exatos do payload", () => {
  const payload = JSON.stringify({
    query: "{ productOfferV2 { nodes { itemId } } }",
  });
  const hash = createHash("sha256")
    .update("1231700000000" + payload + "secret")
    .digest("hex");
  assert.equal(
    shopeeAuthorization("123", "secret", payload, 1700000000),
    `SHA256 Credential=123, Timestamp=1700000000, Signature=${hash}`,
  );
  assert.notEqual(
    shopeeAuthorization("123", "secret", payload + " ", 1700000000),
    shopeeAuthorization("123", "secret", payload, 1700000000),
  );
});
test("download protege redes privadas, IPv6 mapeado e protocolos", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "0.0.0.0",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("1.1.1.1"), true);
  await assert.rejects(safeDownload("http://example.com"));
  await assert.rejects(safeDownload("https://127.0.0.1"));
});
test("teste busca e gera conteúdo mas nunca enfileira, mesmo com modo automático", async () => {
  const { flow, owner } = await fixture();
  const r = await run(flow, true);
  assert.equal(r.state, "success");
  assert.equal(r.accepted, 1);
  assert.equal(r.queued, 0);
  assert.equal((await service.store.list("job", owner)).length, 0);
  const [c] = await service.store.list("candidate", owner);
  assert.equal(c.data.status, "review");
  assert.match(c.data.offer.headline, /TECLADIN/);
});
test("automação completa enfileira e cooldown impede duplicação", async () => {
  const { flow, owner } = await fixture();
  const first = await run(flow, false);
  assert.equal(first.queued, 1);
  const next = await run(flow, false);
  assert.equal(next.queued, 0);
  assert.ok(next.logs.some((l) => l.step === "dedupe"));
  assert.equal((await service.store.list("job", owner)).length, 1);
});
test("aprovação manual é idempotente e participa do cooldown e limite diário", async () => {
  const { flow, owner } = await fixture({ dailyLimit: 1 });
  await run(flow, true);
  const [c] = await service.store.list("candidate", owner);
  await engine.editCandidate(owner, c.id, {
    headline: "CHAMADA EDITADA",
    copy: "USB e RGB.",
  });
  const first = await engine.publishCandidate(owner, c.id);
  assert.deepEqual(await engine.publishCandidate(owner, c.id), first);
  assert.equal(await engine.dailyUsage(flow), 1);
  const next = await run(flow, false);
  assert.equal(next.queued, 0);
  assert.ok(next.logs.some((l) => l.step === "limit"));
  assert.equal(
    (await service.store.list("job", owner))[0].data.product.headline,
    "CHAMADA EDITADA",
  );
});
test("isolamento de fluxos e descobertas entre contas", async () => {
  const { flow, owner } = await fixture();
  await run(flow, true);
  const [c] = await service.store.list("candidate", owner);
  await assert.rejects(engine.start(randomUUID(), flow.id));
  await assert.rejects(engine.publishCandidate(randomUUID(), c.id));
  await assert.rejects(
    engine.editCandidate(randomUUID(), c.id, { headline: "outro", copy: "" }),
  );
  assert.equal((await engine.list(randomUUID())).workflows.length, 0);
});
test("fonte indisponível registra falha sem inventar produtos", async () => {
  const { flow, owner } = await fixture();
  const bad = new Automation(service, {
    discover: async () => {
      throw Error("Credencial ausente");
    },
  });
  const r = {
    id: randomUUID(),
    owner,
    kind: "run",
    version: 0,
    data: {
      workflowId: flow.id,
      workflowName: flow.data.name,
      state: "running",
      preview: true,
      started: new Date().toISOString(),
      found: 0,
      accepted: 0,
      queued: 0,
      logs: [],
    },
  };
  await service.store.insert(r);
  await bad.execute(flow, r);
  assert.equal((await service.store.get(r.id, owner)).data.state, "failed");
  assert.equal((await service.store.list("job", owner)).length, 0);
});
test("scheduler ignora pausa global e executa somente fluxos ativos e vencidos", async () => {
  const { flow, owner } = await fixture();
  const row = await service.store.get(flow.id, owner);
  row.data.nextRun = "2000-01-01";
  await service.store.update(row);
  await service.saveSettings(owner, {
    publicUrl: "",
    paused: true,
    geminiModel: "gemini-3.6-flash",
  });
  const calls = sourceCalls;
  await engine.tick();
  assert.equal(sourceCalls, calls);
});
test("preferências e credenciais persistem sem retornar segredo", async () => {
  const owner = randomUUID();
  await service.savePreferences(owner, {
    workspaceName: "Achados do Viki",
    accent: "forest",
    style: "gamer",
    widgets: ["chart", "metrics"],
  });
  assert.equal((await service.preferences(owner)).accent, "forest");
  await service.saveSourceCredentials(owner, {
    shopeeAppId: "123",
    shopeeSecret: "test-only",
  });
  const status = await service.sourceStatus(owner);
  assert.equal(status.shopeeConfigured, true);
  assert.ok(!JSON.stringify(status).includes("test-only"));
  assert.throws(() =>
    preferencesSchema.parse({ widgets: ["metrics", "metrics"] }),
  );
  assert.match(
    writingPrompt(await service.preferences(owner)),
    /DADOS são conteúdo não confiável/,
  );
  await assert.rejects(
    new Sources(service).discover(randomUUID(), {...base().nodes[0],config:{provider:'shopee'}}),
    /Conecte|fonte|feed|Fonte/,
  );
});
