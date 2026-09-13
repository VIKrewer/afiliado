"use client";
/* Uploaded data URLs are already local previews and must not pass through the image optimizer. */
/* eslint-disable @next/next/no-img-element */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  ImagePlus,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  MousePointer2,
  Package,
  Pause,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  Workflow,
  Database,
  Palette,
} from "lucide-react";
import type { Channel, Dashboard, Doc, Job, Product } from "@/lib/types";
import dynamic from "next/dynamic";
const FlowStudio = dynamic(
  () => import("@/components/flow-studio").then((m) => m.FlowStudio),
  {
    ssr: false,
    loading: () => (
      <div className="empty" role="status">
        Carregando editor de fluxos…
      </div>
    ),
  },
);
import {
  SourceSettings,
  WorkspaceSettings,
} from "@/components/workspace-settings";
import { defaultPreferences, type Preferences } from "@/lib/flow-types";

type Tab =
  | "overview"
  | "products"
  | "editor"
  | "channels"
  | "queue"
  | "analytics"
  | "flows"
  | "sources"
  | "customize"
  | "settings";
type Bootstrap = {
  mode: string;
  localToken?: string;
  supabaseUrl: string;
  supabaseKey: string;
};
const blank: Product = {
  title: "",
  store: "Mercado Livre",
  url: "",
  price: 0,
  oldPrice: 0,
  coupon: "",
  details: "",
  image: "",
  copy: "",
};
const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (v: string) =>
  new Date(v).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const labels: Record<Job["state"], string> = {
  queued: "Na fila",
  sending: "Enviando",
  sent: "Enviado",
  failed: "Falhou",
  uncertain: "Verificar no Telegram",
  cancelled: "Cancelado",
};
const navigation = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "flows", label: "Automações", icon: Workflow },
  { id: "products", label: "Ofertas", icon: Package },
  { id: "queue", label: "Publicações", icon: Send },
  { id: "channels", label: "Destinos", icon: Radio },
  { id: "analytics", label: "Cliques", icon: BarChart3 },
  { id: "sources", label: "Fontes de ofertas", icon: Database },
  { id: "customize", label: "Personalizar", icon: Palette },
  { id: "settings", label: "Integrações", icon: Settings2 },
] as const;

export default function Page() {
  const [boot, setBoot] = useState<Bootstrap>();
  const [client, setClient] = useState<SupabaseClient>();
  const [token, setToken] = useState("");
  const [data, setData] = useState<Dashboard>();
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobile, setMobile] = useState(false);
  const [product, setProduct] = useState<Product>({ ...blank });
  const [editId, setEditId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [scheduled, setScheduled] = useState("");
  const requestId = useRef("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false);
  const [channel, setChannel] = useState({
    name: "",
    chatId: "",
    threadId: "",
  });
  const [discovered, setDiscovered] = useState<Channel[]>([]);
  const [settings, setSettings] = useState({
    publicUrl: "",
    paused: false,
    geminiModel: "gemini-3.6-flash",
    telegramToken: "",
    geminiKey: "",
  });
  const [tracking, setTracking] = useState(true);
  const [search, setSearch] = useState("");
  const [confirmRetry, setConfirmRetry] = useState("");
  const [preferences, setPreferences] =
    useState<Preferences>(defaultPreferences);
  const api = useCallback(
    async (path: string, method = "GET", body?: unknown) => {
      let access = token;
      if (client) {
        const { data } = await client.auth.getSession();
        access = data.session?.access_token || "";
      }
      const r = await fetch(`/api/${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${access}`,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const result = await r.json().catch(() => ({
        message: "API indisponível. Inicie com npm run dev.",
      }));
      if (!r.ok)
        throw new Error(result.message || "Não foi possível concluir.");
      return result;
    },
    [token, client],
  );
  const refresh = useCallback(async () => {
    const r: Dashboard = await api("dashboard");
    setData(r);
    return r;
  }, [api]);
  useEffect(() => {
    let off: (() => void) | undefined;
    fetch("/api/bootstrap")
      .then(async (r) => {
        if (!r.ok) throw new Error("API indisponível. Inicie com npm run dev.");
        return r.json();
      })
      .then((b: Bootstrap) => {
        setBoot(b);
        if (b.mode === "local") setToken(b.localToken || "");
        else {
          const c = createClient(b.supabaseUrl, b.supabaseKey);
          setClient(c);
          c.auth
            .getSession()
            .then(({ data }) => setToken(data.session?.access_token || ""));
          const { data } = c.auth.onAuthStateChange((_event, session) =>
            setToken(session?.access_token || ""),
          );
          off = () => data.subscription.unsubscribe();
        }
      })
      .catch((e) => setError(e.message));
    return () => off?.();
  }, []);
  useEffect(() => {
    if (!token) return;
    let active = true;
    void api("preferences")
      .then((p: Preferences) => {
        if (active) setPreferences(p);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    void api("dashboard")
      .then((d: Dashboard) => {
        if (active) {
          setData(d);
          setSettings((s) => ({
            ...s,
            publicUrl: d.settings.publicUrl,
            paused: d.settings.paused,
            geminiModel: d.settings.geminiModel,
          }));
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    const interval = setInterval(() => void refresh().catch(() => {}), 8000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [token, refresh, api]);
  async function task(work: () => Promise<unknown>, success = "") {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      if (success) setNotice(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocorreu um erro.");
    } finally {
      setBusy(false);
    }
  }
  function go(value: Tab) {
    setTab(value);
    setMobile(false);
    setNotice("");
  }
  function edit(doc?: Doc<Product>) {
    setProduct(doc ? { ...doc.data } : { ...blank });
    setEditId(doc?.id || "");
    setSelected([]);
    setScheduled("");
    requestId.current = crypto.randomUUID();
    go("editor");
  }
  async function save() {
    const doc: Doc<Product> = await api(
      editId ? `products/${editId}` : "products",
      editId ? "PUT" : "POST",
      product,
    );
    setEditId(doc.id);
    await refresh();
    return doc;
  }
  async function publish() {
    const doc = await save();
    if (!requestId.current) requestId.current = crypto.randomUUID();
    await api("jobs", "POST", {
      productId: doc.id,
      channelIds: selected,
      requestId: requestId.current,
      tracking,
      ...(scheduled ? { scheduledAt: new Date(scheduled).toISOString() } : {}),
    });
    requestId.current = crypto.randomUUID();
    await refresh();
    go("queue");
  }
  function upload(file?: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Escolha uma foto de até 5 MB.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Use JPG, PNG ou WebP.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setProduct((p) => ({ ...p, image: String(reader.result) }));
    reader.onerror = () => setError("Não foi possível ler a foto.");
    reader.readAsDataURL(file);
  }
  async function login(event: FormEvent) {
    event.preventDefault();
    await task(async () => {
      if (!client) throw new Error("Autenticação ainda não carregou.");
      const r = signup
        ? await client.auth.signUp({ email, password })
        : await client.auth.signInWithPassword({ email, password });
      if (r.error) throw new Error(r.error.message);
      if (signup && !r.data.session)
        setNotice(
          "Conta criada. Confirme o link recebido por e-mail antes de entrar.",
        );
    });
  }
  const message = (
    <>
      {error && (
        <div className="alert error" role="alert">
          <span>{error}</span>
          <button aria-label="Fechar erro" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          <CheckCircle2 size={18} />
          <span>{notice}</span>
          <button aria-label="Fechar aviso" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
  if (!boot || (!token && boot.mode === "local"))
    return (
      <main className="entry">
        <div className="entry-panel">
          <Brand />
          <h1>Conectando sua central</h1>
          <p>Carregando a API e suas configurações.</p>
          {message}
          <button className="button" onClick={() => location.reload()}>
            Tentar novamente
          </button>
        </div>
      </main>
    );
  if (!token)
    return (
      <main className="entry">
        <form className="entry-panel" onSubmit={login}>
          <Brand />
          <h1>
            {signup ? "Crie sua conta" : "Sua próxima oferta começa aqui."}
          </h1>
          <p>Organize, publique e acompanhe suas promoções.</p>
          {message}
          <label>
            E-mail
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={signup ? "new-password" : "current-password"}
            />
          </label>
          <button className="button primary" disabled={busy}>
            {signup ? "Criar conta" : "Entrar"}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setSignup(!signup)}
          >
            {signup ? "Já tenho uma conta" : "Criar uma conta"}
          </button>
        </form>
      </main>
    );
  const sent = data?.jobs.filter((j) => j.data.state === "sent").length || 0,
    queued = data?.jobs.filter((j) => j.data.state === "queued").length || 0;
  return (
    <div
      className={`app-shell theme-${preferences.accent} density-${preferences.density}`}
    >
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <Brand />
        <div className="workspace">
          <Radio size={20} />
          <div>
            <strong>{preferences.workspaceName}</strong>
            <small>
              {boot.mode === "local"
                ? "Acesso local privado"
                : "Workspace pessoal"}
            </small>
          </div>
        </div>
        <nav aria-label="Navegação principal">
          {navigation.map((n) => (
            <button
              key={n.id}
              className={
                tab === n.id || (tab === "editor" && n.id === "products")
                  ? "nav-link active"
                  : "nav-link"
              }
              onClick={() => go(n.id)}
            >
              <n.icon size={19} />
              {n.label}
              {n.id === "queue" && queued > 0 && (
                <span className="count">{queued}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="worker-status">
            <span
              className={`status-dot ${data?.settings.paused ? "paused" : ""}`}
            />
            {data?.settings.paused
              ? "Publicações pausadas"
              : "Agendador conectado"}
          </div>
          <p>Agendamentos executam enquanto o servidor está ligado.</p>
          <div className="account">
            <ShieldCheck size={20} />
            <div>
              <strong>{data?.settings.storage || "Conectando"}</strong>
              <small>
                {boot.mode === "local"
                  ? "Neste computador"
                  : "Conta autenticada"}
              </small>
            </div>
            {client && (
              <button
                aria-label="Sair"
                onClick={() => void client.auth.signOut()}
              >
                <LogOut size={18} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <main className="main-content">
        <div className="mobile-header">
          <Brand />
          <button
            aria-label="Abrir navegação"
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
        </div>
        <header className="page-header">
          <div>
            <h1>
              {
                {
                  overview: "Sua central de ofertas",
                  products: "Ofertas",
                  editor: editId ? "Editar oferta" : "Nova oferta",
                  channels: "Destinos do Telegram",
                  queue: "Publicações",
                  analytics: "Cliques e alcance",
                  settings: "Integrações",
                  flows: "Seu próximo achado, no automático",
                  sources: "Fontes de ofertas",
                  customize: "Do seu jeito",
                }[tab]
              }
            </h1>
            <p>
              {
                {
                  overview: "Da boa descoberta ao clique. Tudo no mesmo lugar.",
                  products:
                    "Seu catálogo, com as informações que você revisou.",
                  editor:
                    "Prepare a mensagem, confira a prévia e escolha onde publicar.",
                  channels: "Um bot. Vários canais, grupos e conversas.",
                  queue: "Acompanhe cada envio, do agendamento à confirmação.",
                  analytics:
                    "Acessos registrados pelos seus links de rastreamento.",
                  settings:
                    "Conecte os serviços que fazem sua operação funcionar.",
                  flows:
                    "Desenhe o caminho da descoberta à publicação. Cada etapa sob seu controle.",
                  sources:
                    "Conecte catálogos de produtos para alimentar suas automações.",
                  customize: "Seu painel, sua voz e seu jeito de recomendar.",
                }[tab]
              }
            </p>
          </div>
          {tab !== "editor" && (
            <button className="button primary" onClick={() => edit()}>
              <Plus size={17} />
              Nova oferta
            </button>
          )}
        </header>
        {message}
        {busy && (
          <div className="working" role="status">
            <LoaderCircle className="spin" size={16} />
            Processando…
          </div>
        )}
        {!data ? (
          <div className="empty">
            <LoaderCircle className="spin" />
            <h2>Carregando suas ofertas</h2>
          </div>
        ) : (
          <>
            {tab === "flows" && (
              <FlowStudio api={api} channels={data.channels} />
            )}
            {tab === "sources" && <SourceSettings api={api} />}
            {tab === "customize" && (
              <WorkspaceSettings
                api={api}
                preferences={preferences}
                onSave={setPreferences}
              />
            )}
            {tab === "overview" && (
              <div className="overview-widgets">
                {(!data.settings.telegramConfigured ||
                  !data.channels.length ||
                  !data.settings.publicUrl) && (
                  <div className="setup-banner">
                    <div>
                      <h2>Prepare sua primeira publicação</h2>
                      <p>
                        Conecte o bot, adicione um destino e configure os links.
                      </p>
                      <div className="setup-steps">
                        <span
                          className={
                            data.settings.telegramConfigured ? "done" : ""
                          }
                        >
                          <Check size={14} />
                          Bot conectado
                        </span>
                        <span className={data.channels.length ? "done" : ""}>
                          <Check size={14} />
                          Destino cadastrado
                        </span>
                        <span className={data.settings.publicUrl ? "done" : ""}>
                          <Check size={14} />
                          URL pública
                        </span>
                      </div>
                    </div>
                    <button
                      className="button"
                      onClick={() =>
                        go(
                          !data.settings.telegramConfigured ||
                            !data.settings.publicUrl
                            ? "settings"
                            : "channels",
                        )
                      }
                    >
                      Configurar
                      <ArrowRight size={16} />
                    </button>
                  </div>
                )}
                {preferences.widgets.includes("metrics") && (
                  <div
                    className="metrics"
                    style={{ order: preferences.widgets.indexOf("metrics") }}
                  >
                    <Metric
                      label="Cliques registrados"
                      value={data.analytics.clicks}
                      detail="Sem bots identificados"
                    />
                    <Metric
                      label="Visitantes estimados"
                      value={data.analytics.unique}
                      detail="Identificador anônimo no navegador"
                    />
                    <Metric
                      label="Publicações enviadas"
                      value={sent}
                      detail={`${queued} aguardando na fila`}
                    />
                    <Metric
                      label="Ofertas cadastradas"
                      value={data.products.length}
                      detail={`${data.channels.filter((c) => c.data.enabled).length} destinos ativos`}
                    />
                  </div>
                )}
                {preferences.widgets.includes("offers") && (
                  <section
                    style={{ order: preferences.widgets.indexOf("offers") }}
                  >
                    <div className="section-heading">
                      <h2>Prontas para ganhar o mundo</h2>
                      <button
                        className="text-button"
                        onClick={() => go("products")}
                      >
                        Todas as ofertas
                        <ArrowRight size={16} />
                      </button>
                    </div>
                    {data.products.length ? (
                      <div className="product-grid">
                        {data.products
                          .slice(-3)
                          .reverse()
                          .map((p) => (
                            <ProductCard
                              key={p.id}
                              product={p}
                              onEdit={() => edit(p)}
                            />
                          ))}
                      </div>
                    ) : (
                      <Empty
                        title="Seu próximo achado começa aqui"
                        text="Conecte uma fonte e crie um fluxo para descobrir ofertas automaticamente. Você também pode cadastrar uma oferta manual."
                        action="Criar automação"
                        onAction={() => go("flows")}
                      />
                    )}
                  </section>
                )}
                {preferences.widgets.includes("chart") && (
                  <section
                    className="panel"
                    style={{ order: preferences.widgets.indexOf("chart") }}
                  >
                    <div className="section-heading">
                      <h2>Cliques nos últimos 7 dias</h2>
                      <span className="muted">UTC</span>
                    </div>
                    <Chart days={data.analytics.days} />
                  </section>
                )}
                {preferences.widgets.includes("actions") && (
                  <section
                    className="panel quick-actions"
                    style={{ order: preferences.widgets.indexOf("actions") }}
                  >
                    <h2>Seu fluxo de publicação</h2>
                    <button onClick={() => go("flows")}>
                      <Workflow />
                      <span>
                        <strong>Configure sua automação</strong>
                        <small>Busca, filtros, IA e publicação</small>
                      </span>
                      <ArrowRight />
                    </button>
                    <button onClick={() => go("channels")}>
                      <Radio />
                      <span>
                        <strong>Escolha seus destinos</strong>
                        <small>Canais, grupos e DMs</small>
                      </span>
                      <ArrowRight />
                    </button>
                    <button onClick={() => go("queue")}>
                      <Clock3 />
                      <span>
                        <strong>Acompanhe os envios</strong>
                        <small>Agendamentos e histórico</small>
                      </span>
                      <ArrowRight />
                    </button>
                  </section>
                )}
              </div>
            )}
            {tab === "products" && (
              <>
                <div className="toolbar">
                  <input
                    aria-label="Buscar ofertas"
                    placeholder="Buscar por título ou loja…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <span>{data.products.length} ofertas</span>
                </div>
                {data.products.length ? (
                  <div className="product-grid">
                    {data.products
                      .filter((p) =>
                        `${p.data.title} ${p.data.store}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .reverse()
                      .map((p) => (
                        <ProductCard
                          key={p.id}
                          product={p}
                          onEdit={() => edit(p)}
                        />
                      ))}
                  </div>
                ) : (
                  <Empty
                    title="Seu catálogo ainda está vazio"
                    text="Adicione os produtos que você quer recomendar."
                    action="Adicionar produto"
                    onAction={() => edit()}
                  />
                )}
              </>
            )}
            {tab === "editor" && (
              <div className="editor-layout">
                <form
                  className="panel editor-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void task(save, "Oferta salva.");
                  }}
                >
                  <h2>Informações da oferta</h2>
                  <label>
                    Nome do produto
                    <input
                      required
                      minLength={3}
                      maxLength={180}
                      value={product.title}
                      onChange={(e) =>
                        setProduct({ ...product, title: e.target.value })
                      }
                      placeholder="Ex.: Fone Bluetooth com cancelamento de ruído"
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      Loja
                      <select
                        value={product.store}
                        onChange={(e) =>
                          setProduct({
                            ...product,
                            store: e.target.value as Product["store"],
                          })
                        }
                      >
                        <option>Mercado Livre</option>
                        <option>Shopee</option>
                        <option>Outra</option>
                      </select>
                    </label>
                    <label>
                      Cupom <span>opcional</span>
                      <input
                        maxLength={80}
                        value={product.coupon}
                        onChange={(e) =>
                          setProduct({ ...product, coupon: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Seu link de afiliado
                    <input
                      required
                      type="url"
                      value={product.url}
                      onChange={(e) =>
                        setProduct({ ...product, url: e.target.value })
                      }
                      placeholder="https://…"
                    />
                    <small>
                      Cole o link comissionado da loja. Seus parâmetros serão
                      preservados.
                    </small>
                  </label>
                  <div className="form-row">
                    <label>
                      Preço atual (R$)
                      <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={product.price || ""}
                        onChange={(e) =>
                          setProduct({
                            ...product,
                            price: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Preço anterior (R$) <span>opcional</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={product.oldPrice || ""}
                        onChange={(e) =>
                          setProduct({
                            ...product,
                            oldPrice: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Características e condições
                    <textarea
                      rows={3}
                      maxLength={1600}
                      value={product.details}
                      onChange={(e) =>
                        setProduct({ ...product, details: e.target.value })
                      }
                      placeholder="Material, tamanho, condições do cupom… Apenas informações verificadas."
                    />
                    <small>
                      Orientam a IA. Inclua no texto final as condições
                      essenciais.
                    </small>
                  </label>
                  <label className="upload">
                    <ImagePlus size={23} />
                    <strong>
                      {product.image
                        ? "Trocar foto"
                        : "Adicionar foto do produto"}
                    </strong>
                    <small>JPG, PNG ou WebP · até 5 MB</small>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => upload(e.target.files?.[0])}
                    />
                  </label>
                  {product.image && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setProduct({ ...product, image: "" })}
                    >
                      Remover foto
                    </button>
                  )}
                  <div className="section-heading">
                    <h2>Texto da promoção</h2>
                    <button
                      type="button"
                      disabled={busy}
                      className="button soft"
                      onClick={() =>
                        void task(async () => {
                          const r = await api("generate", "POST", product);
                          setProduct((p) => ({
                            ...p,
                            copy: r.copy,
                            headline: r.headline,
                          }));
                        }, "Texto gerado. Revise antes de publicar.")
                      }
                    >
                      <Sparkles size={16} />
                      Gerar com Gemini
                    </button>
                  </div>
                  <label>
                    Chamada da promoção
                    <input
                      maxLength={65}
                      value={product.headline || ""}
                      onChange={(e) =>
                        setProduct({ ...product, headline: e.target.value })
                      }
                      placeholder="TECLADIN TOP PRA TU JOGAR"
                    />
                  </label>
                  <label>
                    Descrição para a mensagem
                    <textarea
                      rows={4}
                      maxLength={500}
                      value={product.copy}
                      onChange={(e) =>
                        setProduct({ ...product, copy: e.target.value })
                      }
                      placeholder="Escreva sua recomendação ou gere uma sugestão com IA."
                    />
                    <small>
                      {product.copy.length}/500 · Título, preço e cupom são
                      adicionados automaticamente.
                    </small>
                  </label>
                  <div className="form-actions">
                    <button className="button" disabled={busy}>
                      Salvar oferta
                    </button>
                    {editId && (
                      <button
                        type="button"
                        className="text-button danger"
                        disabled={busy}
                        onClick={() =>
                          void task(async () => {
                            await api(`products/${editId}`, "DELETE");
                            await refresh();
                            go("products");
                          }, "Oferta removida. Histórico preservado.")
                        }
                      >
                        <Trash2 size={15} />
                        Excluir oferta
                      </button>
                    )}
                  </div>
                </form>
                <aside className="preview-column">
                  <div className="preview-heading">
                    <Send size={17} />
                    <strong>Prévia no Telegram</strong>
                  </div>
                  <div className="telegram-preview">
                    <div className="message-card">
                      {product.image ? (
                        <img src={product.image} alt="Foto da oferta" />
                      ) : (
                        <div className="preview-no-image">
                          <ImagePlus />
                          <span>A mensagem será enviada sem foto</span>
                        </div>
                      )}
                      <div className="message-copy">
                        {product.headline && (
                          <p className="message-headline">
                            <strong>{product.headline}</strong>
                          </p>
                        )}
                        <strong>{product.title || "Nome do produto"}</strong>
                        {product.copy && <p>{product.copy}</p>}
                        <div className="message-price">
                          {product.oldPrice > product.price && (
                            <del>De {money(product.oldPrice)}</del>
                          )}
                          <strong>Por {money(product.price)}</strong>
                        </div>
                        {product.coupon && (
                          <p>
                            Cupom: <code>{product.coupon}</code>
                          </p>
                        )}
                        <small>
                          {product.store} · Preço sujeito a alteração.
                          <br />
                          Publicidade · Link de afiliado.
                        </small>
                      </div>
                      <div className="telegram-cta">
                        Ver oferta <ExternalLink size={13} />
                      </div>
                    </div>
                    <p className="preview-note">
                      A aparência final varia conforme o aplicativo.
                    </p>
                  </div>
                  <section className="panel delivery">
                    <h2>Onde publicar</h2>
                    {data.channels
                      .filter((c) => c.data.enabled)
                      .map((c) => (
                        <label className="check-row" key={c.id}>
                          <input
                            type="checkbox"
                            checked={selected.includes(c.id)}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...selected, c.id]
                                  : selected.filter((id) => id !== c.id),
                              )
                            }
                          />
                          <span>
                            <strong>{c.data.name}</strong>
                            <small>
                              {c.data.type} · {c.data.chatId}
                            </small>
                          </span>
                        </label>
                      ))}
                    {!data.channels.some((c) => c.data.enabled) && (
                      <p>
                        Nenhum destino ativo.{" "}
                        <button
                          className="text-button"
                          onClick={() => go("channels")}
                        >
                          Adicionar destino
                        </button>
                      </p>
                    )}
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={tracking}
                        onChange={(e) => setTracking(e.target.checked)}
                      />
                      Rastrear cliques (requer URL pública)
                    </label>
                    {!tracking && (
                      <p className="footnote">
                        Será enviado seu link direto de afiliado, sem registro
                        de cliques.
                      </p>
                    )}
                    <label>
                      Agendar <span>opcional · horário local</span>
                      <input
                        type="datetime-local"
                        value={scheduled}
                        onChange={(e) => setScheduled(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy || !selected.length}
                      className="button primary full"
                      onClick={() =>
                        void task(
                          publish,
                          scheduled
                            ? "Publicação agendada."
                            : "Publicação adicionada à fila.",
                        )
                      }
                    >
                      <Send size={16} />
                      {scheduled
                        ? "Agendar publicação"
                        : "Publicar nos destinos selecionados"}
                    </button>
                    <small>
                      Ao publicar, você aprova a prévia. Cada destino recebe um
                      link de tracking próprio.
                    </small>
                  </section>
                </aside>
              </div>
            )}
            {tab === "channels" && (
              <div className="split-layout">
                <section>
                  <div className="panel">
                    <h2>Destinos cadastrados</h2>
                    {data.channels.length ? (
                      data.channels.map((c) => (
                        <div className="destination" key={c.id}>
                          <Radio />
                          <div>
                            <strong>{c.data.name}</strong>
                            <small>
                              {c.data.type} · {c.data.chatId}
                              {c.data.threadId
                                ? ` · tópico ${c.data.threadId}`
                                : ""}
                            </small>
                          </div>
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() =>
                              void task(async () => {
                                await api("channels", "POST", {
                                  id: c.id,
                                  ...c.data,
                                  enabled: !c.data.enabled,
                                });
                                await refresh();
                              })
                            }
                          >
                            {c.data.enabled ? "Pausar" : "Ativar"}
                          </button>
                          <button
                            aria-label={`Remover ${c.data.name}`}
                            disabled={busy}
                            onClick={() =>
                              void task(async () => {
                                await api(`channels/${c.id}`, "DELETE");
                                await refresh();
                              }, "Destino removido.")
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="empty-inline">
                        Adicione seu primeiro grupo, canal ou conversa.
                      </p>
                    )}
                  </div>
                  <section className="panel instructions">
                    <h2>Como conectar</h2>
                    <p>
                      <strong>Canal:</strong> adicione o bot como administrador
                      e permita publicar. Use @nomedocanal ou ID numérico para
                      canais privados.
                    </p>
                    <p>
                      <strong>Grupo:</strong> adicione o bot e permita mensagens
                      e fotos. Use o ID numérico.
                    </p>
                    <p>
                      <strong>DM:</strong> a pessoa precisa abrir o bot e tocar
                      em Iniciar (/start). Bots não iniciam conversas.
                    </p>
                    <p>
                      <strong>Tópico:</strong> informe também o ID do tópico, ou
                      deixe vazio para a conversa principal.
                    </p>
                  </section>
                </section>
                <form
                  className="panel"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void task(async () => {
                      await api("channels", "POST", {
                        name: channel.name,
                        chatId: channel.chatId.trim(),
                        ...(channel.threadId
                          ? { threadId: Number(channel.threadId) }
                          : {}),
                      });
                      setChannel({ name: "", chatId: "", threadId: "" });
                      await refresh();
                    }, "Destino validado e salvo.");
                  }}
                >
                  <h2>Adicionar destino</h2>
                  <label>
                    Nome no painel
                    <input
                      required
                      value={channel.name}
                      onChange={(e) =>
                        setChannel({ ...channel, name: e.target.value })
                      }
                      placeholder="Ofertas de tecnologia"
                    />
                  </label>
                  <label>
                    Chat ID ou @canal
                    <input
                      required
                      value={channel.chatId}
                      onChange={(e) =>
                        setChannel({ ...channel, chatId: e.target.value })
                      }
                      placeholder="-1001234567890 ou @meucanal"
                    />
                  </label>
                  <label>
                    ID do tópico <span>opcional</span>
                    <input
                      type="number"
                      min="1"
                      value={channel.threadId}
                      onChange={(e) =>
                        setChannel({ ...channel, threadId: e.target.value })
                      }
                    />
                  </label>
                  <button disabled={busy} className="button primary">
                    <CheckCircle2 size={16} />
                    Validar e salvar
                  </button>
                  <hr />
                  <h3>Não sabe o chat ID?</h3>
                  <p>
                    Envie /start ao bot na conversa desejada, ou adicione-o ao
                    grupo, e procure as conversas recentes.
                  </p>
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void task(async () => {
                        const chats = await api("telegram/discover", "POST");
                        setDiscovered(chats);
                        if (!chats.length)
                          setNotice(
                            "Nenhuma conversa recente. Envie /start ao bot e tente de novo.",
                          );
                      })
                    }
                  >
                    <RefreshCw size={16} />
                    Buscar conversas
                  </button>
                  {discovered.map((c) => (
                    <button
                      type="button"
                      className="discovered"
                      key={c.chatId}
                      onClick={() =>
                        setChannel({
                          name: c.name,
                          chatId: c.chatId,
                          threadId: "",
                        })
                      }
                    >
                      <span>
                        {c.name}
                        <small>
                          {c.chatId} · {c.type}
                        </small>
                      </span>
                      <Plus size={16} />
                    </button>
                  ))}
                </form>
              </div>
            )}
            {tab === "queue" && (
              <>
                <div className="toolbar">
                  <span>
                    {queued} na fila · {sent} confirmadas
                  </span>
                  <button
                    disabled={busy}
                    className="button"
                    onClick={() =>
                      void task(async () => {
                        await api("settings", "PUT", {
                          publicUrl: data.settings.publicUrl,
                          geminiModel: data.settings.geminiModel,
                          paused: !data.settings.paused,
                        });
                        await refresh();
                      })
                    }
                  >
                    <Pause size={16} />
                    {data.settings.paused ? "Retomar envios" : "Pausar envios"}
                  </button>
                </div>
                {data.jobs.length ? (
                  <div className="panel table-panel">
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Promoção / destino</th>
                            <th>Status</th>
                            <th>Horário</th>
                            <th>Cliques</th>
                            <th>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.jobs.map((j) => (
                            <tr key={j.id}>
                              <td>
                                <strong>{j.data.product.title}</strong>
                                <small>
                                  {j.data.channel.name}
                                  {j.data.tracking === false
                                    ? " · Sem tracking"
                                    : ""}
                                </small>
                                {j.data.error && (
                                  <p className="job-error">{j.data.error}</p>
                                )}
                              </td>
                              <td>
                                <span className={`badge ${j.data.state}`}>
                                  {labels[j.data.state]}
                                </span>
                              </td>
                              <td>{date(j.data.sentAt || j.data.due)}</td>
                              <td>
                                {data.analytics.byJob.find((v) => v.id === j.id)
                                  ?.clicks || 0}
                              </td>
                              <td>
                                <div className="table-actions">
                                  <button
                                    className="text-button"
                                    onClick={() =>
                                      void task(
                                        () =>
                                          navigator.clipboard.writeText(
                                            j.data.trackUrl,
                                          ),
                                        "Link copiado. Abrir esse link registra um clique.",
                                      )
                                    }
                                  >
                                    Copiar link
                                  </button>
                                  {j.data.state === "queued" && (
                                    <button
                                      disabled={busy}
                                      className="text-button danger"
                                      onClick={() =>
                                        void task(async () => {
                                          await api(
                                            `jobs/${j.id}/cancel`,
                                            "POST",
                                          );
                                          await refresh();
                                        }, "Agendamento cancelado.")
                                      }
                                    >
                                      Cancelar
                                    </button>
                                  )}
                                  {["failed", "uncertain"].includes(
                                    j.data.state,
                                  ) && (
                                    <button
                                      disabled={busy}
                                      className="text-button"
                                      onClick={() =>
                                        j.data.state === "uncertain"
                                          ? setConfirmRetry(j.id)
                                          : void task(async () => {
                                              await api(
                                                `jobs/${j.id}/retry`,
                                                "POST",
                                                {},
                                              );
                                              await refresh();
                                            }, "Envio recolocado na fila.")
                                      }
                                    >
                                      Tentar novamente
                                    </button>
                                  )}
                                </div>
                                {confirmRetry === j.id && (
                                  <div className="retry-confirm">
                                    <p>
                                      A mensagem pode já ter sido enviada.
                                      Confira o Telegram.
                                    </p>
                                    <button
                                      disabled={busy}
                                      className="button"
                                      onClick={() =>
                                        void task(async () => {
                                          await api(
                                            `jobs/${j.id}/retry`,
                                            "POST",
                                            { confirmed: true },
                                          );
                                          setConfirmRetry("");
                                          await refresh();
                                        })
                                      }
                                    >
                                      Conferi: reenviar
                                    </button>
                                    <button
                                      className="text-button"
                                      onClick={() => setConfirmRetry("")}
                                    >
                                      Voltar
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <Empty
                    title="Nenhuma publicação ainda"
                    text="Prepare uma oferta e selecione os destinos."
                    action="Preparar oferta"
                    onAction={() => edit()}
                  />
                )}
              </>
            )}
            {tab === "analytics" && (
              <>
                <div className="metrics">
                  <Metric
                    label="Cliques registrados"
                    value={data.analytics.clicks}
                    detail="Sem bots identificados"
                  />
                  <Metric
                    label="Visitantes estimados"
                    value={data.analytics.unique}
                    detail="Mesmo navegador = mesmo visitante"
                  />
                  <Metric
                    label="Bots / prévias"
                    value={data.analytics.bots}
                    detail="Separados das métricas principais"
                  />
                  <Metric
                    label="Publicações enviadas"
                    value={sent}
                    detail="Confirmações do Telegram"
                  />
                </div>
                <section className="panel">
                  <h2>
                    Últimos 7 dias <span className="muted">· UTC</span>
                  </h2>
                  <Chart days={data.analytics.days} />
                </section>
                <section className="panel table-panel">
                  <h2>Por publicação e destino</h2>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Oferta</th>
                          <th>Destino</th>
                          <th>Cliques</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.analytics.byJob.map((r) => (
                          <tr key={r.id}>
                            <td>{r.title}</td>
                            <td>{r.channel}</td>
                            <td>{r.clicks}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!data.analytics.byJob.length && (
                    <p className="empty-inline">
                      As publicações aparecerão aqui após o primeiro envio.
                    </p>
                  )}
                </section>
                <p className="footnote">
                  Cliques não são vendas. Visitantes usam um identificador
                  anônimo de navegador válido por 30 dias. Bots e prévias
                  conhecidos são filtrados pelo user-agent; a identificação não
                  é perfeita. Totais consideram todo o histórico. Não
                  armazenamos IP bruto.
                </p>
              </>
            )}
            {tab === "settings" && (
              <div className="settings-layout">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void task(async () => {
                      await api("settings", "PUT", settings);
                      setSettings((s) => ({
                        ...s,
                        telegramToken: "",
                        geminiKey: "",
                      }));
                      await refresh();
                    }, "Integrações salvas com segurança.");
                  }}
                >
                  <section className="panel">
                    <div className="integration-title">
                      <Send />
                      <h2>Telegram</h2>
                      <span
                        className={`badge ${data.settings.telegramConfigured ? "sent" : "queued"}`}
                      >
                        {data.settings.telegramConfigured
                          ? "Configurado"
                          : "Pendente"}
                      </span>
                    </div>
                    <p>
                      O token do .env é reconhecido. Preencha para substituí-lo
                      nesta conta.
                    </p>
                    <label>
                      Token do bot
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={settings.telegramToken}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            telegramToken: e.target.value,
                          })
                        }
                        placeholder={
                          data.settings.telegramConfigured
                            ? "Token salvo — valor protegido"
                            : "123456789:AA…"
                        }
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      className="button"
                      onClick={() =>
                        void task(async () => {
                          const r = await api("telegram/check", "POST");
                          setNotice(
                            `Bot validado: @${r.username}. Nenhuma mensagem foi enviada.`,
                          );
                        })
                      }
                    >
                      <ShieldCheck size={16} />
                      Verificar bot salvo
                    </button>
                  </section>
                  <section className="panel">
                    <div className="integration-title">
                      <Sparkles />
                      <h2>Gemini</h2>
                      <span
                        className={`badge ${data.settings.geminiConfigured ? "sent" : "queued"}`}
                      >
                        {data.settings.geminiConfigured
                          ? "Configurado"
                          : "Pendente"}
                      </span>
                    </div>
                    <p>
                      A IA usa as características informadas. Revise antes de
                      publicar.
                    </p>
                    <label>
                      Chave da API
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={settings.geminiKey}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            geminiKey: e.target.value,
                          })
                        }
                        placeholder={
                          data.settings.geminiConfigured
                            ? "Chave salva — valor protegido"
                            : "Sua chave Gemini"
                        }
                      />
                    </label>
                    <label>
                      Modelo
                      <input
                        required
                        value={settings.geminiModel}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            geminiModel: e.target.value,
                          })
                        }
                      />
                    </label>
                  </section>
                  <section className="panel">
                    <div className="integration-title">
                      <MousePointer2 />
                      <h2>Links de tracking</h2>
                    </div>
                    <label>
                      Endereço público do site
                      <input
                        type="url"
                        value={settings.publicUrl}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            publicUrl: e.target.value,
                          })
                        }
                        placeholder="https://ofertas.seudominio.com"
                      />
                      <small>
                        Precisa encaminhar /r/* para esta aplicação. Localhost
                        não funciona no celular dos participantes.
                      </small>
                    </label>
                    <p>
                      Alterações valem para novas publicações. Mantenha o
                      domínio anterior ativo para os links já enviados.
                    </p>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={settings.paused}
                        onChange={(e) =>
                          setSettings({ ...settings, paused: e.target.checked })
                        }
                      />
                      Pausar os envios automáticos
                    </label>
                  </section>
                  <button disabled={busy} className="button primary">
                    <Check size={16} />
                    Salvar integrações
                  </button>
                </form>
                <aside>
                  <section className="panel instructions">
                    <h2>Marketplaces</h2>
                    <h3>Shopee</h3>
                    <p>
                      Existe um portal oficial de Open API para afiliados. A
                      documentação e as permissões dependem da conta. O catálogo
                      automático ainda não está integrado.
                    </p>
                    <a
                      href="https://affiliate.shopee.com.br/open_api/document?type=overview"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Portal oficial <ExternalLink size={13} />
                    </a>
                    <h3>Mercado Livre</h3>
                    <p>
                      O programa gera links pela central e barra de afiliados.
                      Não foi localizada documentação pública de uma API de
                      afiliados equivalente.
                    </p>
                    <a
                      href="https://www.mercadolivre.com.br/l/afiliados-gere-seus-links"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Gerar link oficial <ExternalLink size={13} />
                    </a>
                    <p>
                      Publique de ambas as lojas: gere seu link comissionado e
                      cadastre a oferta com foto e preço.
                    </p>
                  </section>
                  <section className="panel instructions">
                    <h2>Banco e acesso</h2>
                    <p>
                      <strong>{data.settings.storage}</strong>
                    </p>
                    <p>
                      {boot.mode === "local"
                        ? "Dados salvos neste computador. Para login e hospedagem pública, configure Supabase no .env e execute supabase/setup.sql. Consulte o README."
                        : "A API valida sua sessão Supabase e mantém os dados separados por conta."}
                    </p>
                    <h3>Automação NestJS</h3>
                    <p>
                      Fila persistente consultada a cada 2 segundos.
                      Agendamentos vencidos retomam ao ligar o servidor.
                    </p>
                    <p>
                      Use uma única instância do worker. Para enviar 24 horas
                      por dia, mantenha o backend ligado.
                    </p>
                  </section>
                </aside>
              </div>
            )}
          </>
        )}
        <footer className="footer">
          <span>afiliado. · Sua operação, sob controle.</span>
          <span>Dados reais da sua conta</span>
        </footer>
      </main>
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">af</span>
      <span>
        afiliado<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value.toLocaleString("pt-BR")}</strong>
      <small>{detail}</small>
    </div>
  );
}
function Empty({
  title,
  text,
  action,
  onAction,
}: {
  title: string;
  text: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="empty">
      <Package size={32} />
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="button primary" onClick={onAction}>
        <Plus size={16} />
        {action}
      </button>
    </div>
  );
}
function ProductCard({
  product: p,
  onEdit,
}: {
  product: Doc<Product>;
  onEdit: () => void;
}) {
  return (
    <article className="product-card">
      <div className="product-image">
        {p.data.image ? (
          <img src={p.data.image} alt={p.data.title} />
        ) : (
          <Package size={44} />
        )}
        <span className="store-label">{p.data.store}</span>
      </div>
      <div className="product-body">
        <h3>{p.data.title}</h3>
        <div className="price-line">
          <strong>{money(p.data.price)}</strong>
          {p.data.oldPrice > p.data.price && (
            <del>{money(p.data.oldPrice)}</del>
          )}
        </div>
        <div className="card-bottom">
          <span>{p.data.coupon ? `Cupom: ${p.data.coupon}` : "Sem cupom"}</span>
          <button className="text-button" onClick={onEdit}>
            <Pencil size={14} />
            Preparar post
          </button>
        </div>
      </div>
    </article>
  );
}
function Chart({ days }: { days: { day: string; count: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div
      className="bar-chart"
      role="img"
      aria-label={days.map((d) => `${d.day}: ${d.count} cliques`).join("; ")}
    >
      {days.map((d) => (
        <div className="bar-column" key={d.day}>
          <span>{d.count}</span>
          <div className="bar-track">
            <div style={{ height: `${(d.count / max) * 100}%` }} />
          </div>
          <small>
            {d.day.slice(8)}/{d.day.slice(5, 7)}
          </small>
        </div>
      ))}
    </div>
  );
}
