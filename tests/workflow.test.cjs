const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { randomUUID } = require("node:crypto");
const directory = mkdtempSync(join(tmpdir(), "afiliado-tests-"));
process.env.DATABASE_FILE = join(directory, "test.sqlite");
process.env.SETTINGS_ENCRYPTION_KEY = "ab".repeat(32);
process.env.TELEGRAM_BOT_TOKEN = "123:fake-test-only";
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { Service } = require("../dist-api/service");
const {
  productSchema,
  caption,
  imageFile,
  publicUrl,
} = require("../dist-api/domain");
const { Vault } = require("../dist-api/vault");
const service = new Service();
const originalFetch = global.fetch;
let requests = [];
beforeEach(() => {
  requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(
      JSON.stringify({ ok: true, result: { message_id: 17 } }),
      { status: 200 },
    );
  };
});
after(() => {
  global.fetch = originalFetch;
  service.onModuleDestroy();
  service.store.close();
  if (
    resolve(directory).startsWith(resolve(tmpdir()) + require("node:path").sep)
  )
    rmSync(directory, { recursive: true, force: true });
});
const sample = {
  title: "Fone <Pro> & acessórios",
  store: "Shopee",
  url: "https://shopee.com.br/teste?affiliate_id=123&utm_source=canal",
  price: 99.9,
  oldPrice: 149.9,
  coupon: "CUPOM",
  details: "Bluetooth",
  copy: "Bateria recarregável.",
  image: "",
};
async function fixture() {
  const owner = randomUUID();
  await service.saveSettings(owner, {
    publicUrl: "https://ofertas.example.com",
    paused: false,
    geminiModel: "gemini-2.5-flash",
    telegramToken: "123:fake-test-only",
  });
  const product = await service.saveProduct(owner, sample);
  const channel = {
    id: randomUUID(),
    owner,
    kind: "channel",
    version: 0,
    data: {
      name: "Teste",
      chatId: "-100123",
      type: "supergroup",
      enabled: true,
    },
  };
  await service.store.insert(channel);
  return { owner, product, channel };
}

test("escapa HTML, mantém preço e aviso de afiliado", () => {
  const result = caption(sample);
  assert.match(result, /Fone &lt;Pro&gt; &amp;/);
  assert.match(result, /99,90/);
  assert.match(result, /Link de afiliado/);
  assert.ok(!result.includes("affiliate_id"));
});
test("rejeita URLs privadas, protocolos perigosos e descontos inválidos", () => {
  for (const u of [
    "javascript:alert(1)",
    "http://example.com",
    "https://127.0.0.1/",
    "https://localhost",
    "https://foo.internal",
  ])
    assert.throws(() => publicUrl(u));
  assert.equal(
    productSchema.safeParse({ ...sample, oldPrice: 50 }).success,
    false,
  );
  assert.equal(publicUrl(sample.url), sample.url);
});
test("valida conteúdo da imagem, não só extensão", () => {
  assert.throws(() =>
    imageFile(
      "data:image/png;base64," +
        Buffer.from("not a valid image").toString("base64"),
    ),
  );
  assert.equal(imageFile(""), null);
});
test("credenciais têm criptografia autenticada e não aparecem na view", async () => {
  const { owner } = await fixture();
  const doc = await service.settings(owner);
  assert.ok(!doc.data.secrets.includes("fake-test-only"));
  assert.equal(
    service.credential(doc, "TELEGRAM_BOT_TOKEN"),
    "123:fake-test-only",
  );
  assert.ok(
    !JSON.stringify(await service.settingsView(owner)).includes(
      "fake-test-only",
    ),
  );
  const vault = new Vault();
  assert.throws(() => vault.decrypt(doc.data.secrets.slice(0, -4) + "AAAA"));
});
test("isola produtos e destinos entre usuários", async () => {
  const { product, channel } = await fixture();
  const stranger = randomUUID();
  assert.equal(await service.store.get(product.id, stranger), null);
  await assert.rejects(() =>
    service.enqueue(stranger, {
      productId: product.id,
      channelIds: [channel.id],
      requestId: randomUUID(),
    }),
  );
});
test("deduplica solicitação repetida e faz um único envio", async () => {
  const { owner, product, channel } = await fixture();
  const body = {
    productId: product.id,
    channelIds: [channel.id, channel.id],
    requestId: randomUUID(),
  };
  const a = await service.enqueue(owner, body),
    b = await service.enqueue(owner, body);
  assert.deepEqual(a, b);
  await service.tick();
  await service.tick();
  assert.equal(requests.length, 1);
  const job = await service.store.get(a.ids[0]);
  assert.equal(job.data.state, "sent");
  assert.equal(job.data.messageId, 17);
  const fields = JSON.parse(requests[0].options.body);
  assert.match(
    fields.reply_markup.inline_keyboard[0][0].url,
    /\/r\/[a-f0-9]{32}$/,
  );
});
test("agendamento futuro não envia; cancelamento persiste", async () => {
  const { owner, product, channel } = await fixture();
  const { ids } = await service.enqueue(owner, {
    productId: product.id,
    channelIds: [channel.id],
    requestId: randomUUID(),
    scheduledAt: new Date(Date.now() + 3600000).toISOString(),
  });
  await service.tick();
  assert.equal(requests.length, 0);
  await service.cancel(owner, ids[0]);
  assert.equal((await service.store.get(ids[0])).data.state, "cancelled");
});
test("erro 429 respeita retry_after", async () => {
  const { owner, product, channel } = await fixture();
  const { ids } = await service.enqueue(owner, {
    productId: product.id,
    channelIds: [channel.id],
    requestId: randomUUID(),
  });
  global.fetch = async () =>
    new Response(
      JSON.stringify({ ok: false, parameters: { retry_after: 60 } }),
      { status: 429 },
    );
  await service.tick();
  const job = await service.store.get(ids[0]);
  assert.equal(job.data.state, "queued");
  assert.ok(Date.parse(job.data.due) > Date.now() + 50000);
  await service.cancel(owner, ids[0]);
});
test("timeout é ambíguo e não reenvia automaticamente", async () => {
  const { owner, product, channel } = await fixture();
  const { ids } = await service.enqueue(owner, {
    productId: product.id,
    channelIds: [channel.id],
    requestId: randomUUID(),
  });
  global.fetch = async () => {
    throw new Error("timeout");
  };
  await service.tick();
  assert.equal((await service.store.get(ids[0])).data.state, "uncertain");
  await assert.rejects(() => service.retry(owner, ids[0], false));
});
test("tracking preserva afiliado, separa bots e ignora HEAD", async () => {
  const { owner, product, channel } = await fixture();
  const { ids } = await service.enqueue(owner, {
    productId: product.id,
    channelIds: [channel.id],
    requestId: randomUUID(),
    scheduledAt: new Date(Date.now() + 3600000).toISOString(),
  });
  assert.equal(
    await service.track(
      ids[0],
      "visitor",
      "Mozilla/5.0 iPhone",
      "https://t.me/example",
    ),
    sample.url,
  );
  await service.track(ids[0], "visitor", "Mozilla/5.0 iPhone", "");
  await service.track(ids[0], "bot", "TelegramBot", "");
  await service.track(ids[0], "head", "Mozilla", "", true);
  const { analytics } = await service.dashboard(owner);
  assert.equal(analytics.clicks, 2);
  assert.equal(analytics.unique, 1);
  assert.equal(analytics.bots, 1);
});
test("alterar produto não altera snapshot da mensagem agendada", async () => {
  const { owner, product, channel } = await fixture();
  const { ids } = await service.enqueue(owner, {
    productId: product.id,
    channelIds: [channel.id],
    requestId: randomUUID(),
    scheduledAt: new Date(Date.now() + 3600000).toISOString(),
  });
  await service.saveProduct(owner, { ...sample, price: 50 }, product.id);
  assert.equal((await service.store.get(ids[0])).data.product.price, 99.9);
});
test("controle de versão evita duas atualizações concorrentes", async () => {
  const { product } = await fixture();
  const a = await service.store.get(product.id),
    b = await service.store.get(product.id);
  assert.equal(await service.store.update(a), true);
  assert.equal(await service.store.update(b), false);
});
test("envio sem domínio usa link de afiliado direto e declara ausência de tracking", async () => {
  const { owner, product, channel } = await fixture();
  await service.saveSettings(owner, {
    publicUrl: "",
    paused: false,
    geminiModel: "gemini-3.6-flash",
  });
  const { ids } = await service.enqueue(owner, {
    productId: product.id,
    channelIds: [channel.id],
    requestId: randomUUID(),
    tracking: false,
  });
  const job = await service.store.get(ids[0]);
  assert.equal(job.data.trackUrl, sample.url);
  assert.equal(job.data.tracking, false);
  await service.cancel(owner, ids[0]);
});
test("foto é enviada como multipart e legenda HTML, sem URL pública para upload", async () => {
  const { owner, product, channel } = await fixture();
  await service.saveProduct(
    owner,
    {
      ...sample,
      image:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=",
    },
    product.id,
  );
  const { ids } = await service.enqueue(owner, {
    productId: product.id,
    channelIds: [channel.id],
    requestId: randomUUID(),
  });
  await service.tick();
  assert.equal((await service.store.get(ids[0])).data.state, "sent");
  assert.ok(requests[0].url.endsWith("/sendPhoto"));
  assert.ok(requests[0].options.body instanceof FormData);
  assert.equal(requests[0].options.body.get("parse_mode"), "HTML");
  assert.ok(requests[0].options.body.get("photo").size > 0);
});
