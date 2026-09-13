"use client";
import { useEffect, useState } from "react";
import {
  ArrowUp,
  Check,
  Database,
  ExternalLink,
  Palette,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Api, Preferences } from "@/lib/flow-types";

export function SourceSettings({ api }: { api: Api }) {
  const [status, setStatus] = useState({
    shopeeConfigured: false,
    feedTokenConfigured: false,
  });
  const [keys, setKeys] = useState({
    SHOPEE_APP_ID: "",
    SHOPEE_SECRET: "",
    FEED_TOKEN: "",
  });
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    void api<typeof status>("sources")
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, [api]);
  async function act(check = false) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (check) {
        const r = await api<{ count: number }>("sources/shopee/check", "POST");
        setMessage(
          `Conexão validada: ${r.count} produtos recebidos da Shopee.`,
        );
      } else {
        await api("sources", "PUT", {
          shopeeAppId: keys.SHOPEE_APP_ID,
          shopeeSecret: keys.SHOPEE_SECRET,
          feedToken: keys.FEED_TOKEN,
        });
        setKeys({ SHOPEE_APP_ID: "", SHOPEE_SECRET: "", FEED_TOKEN: "" });
        setStatus(await api("sources"));
        setMessage("Credenciais salvas e criptografadas.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na conexão");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sources-layout">
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="alert success" role="status">
          {message}
        </div>
      )}
      <section className="panel source-intro">
        <Database size={26} />
        <div>
          <h2>Uma fonte conectada. Descobertas contínuas.</h2>
          <p>
            Conecte um catálogo autorizado uma vez. Os fluxos buscam os
            produtos, aplicam suas regras, preparam o conteúdo e publicam no
            ritmo que você definir.
          </p>
        </div>
      </section>
      <div className="source-columns">
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            void act();
          }}
        >
          <div className="integration-title">
            <span className="store-mark shopee">S</span>
            <div>
              <h2>Shopee Affiliate</h2>
              <p>Busca de produtos com link comissionado</p>
            </div>
            <span className="badge">
              {status.shopeeConfigured
                ? "Chaves salvas"
                : "Requer acesso à API"}
            </span>
          </div>
          <p className="source-description">
            É necessário ter acesso à Open API no programa de afiliados. As
            chaves de vendedor da Shopee Open Platform não são as mesmas.
          </p>
          <label>
            App ID
            <input
              autoComplete="off"
              value={keys.SHOPEE_APP_ID}
              onChange={(e) =>
                setKeys({ ...keys, SHOPEE_APP_ID: e.target.value })
              }
              placeholder={
                status.shopeeConfigured
                  ? "Já configurado · deixe vazio para manter"
                  : "Seu App ID de afiliado"
              }
            />
          </label>
          <label>
            Secret
            <input
              type="password"
              autoComplete="new-password"
              value={keys.SHOPEE_SECRET}
              onChange={(e) =>
                setKeys({ ...keys, SHOPEE_SECRET: e.target.value })
              }
              placeholder="Nunca é exibido após salvar"
            />
          </label>
          <div className="form-actions">
            <button className="button primary" disabled={busy}>
              <Save size={16} />
              Salvar chaves
            </button>
            <button
              type="button"
              className="button"
              disabled={busy || !status.shopeeConfigured}
              onClick={() => void act(true)}
            >
              Testar conexão
            </button>
          </div>
          <a
            href="https://affiliate.shopee.com.br/open_api/document?type=overview"
            target="_blank"
            rel="noreferrer"
          >
            Abrir portal de afiliados <ExternalLink size={13} />
          </a>
        </form>
        <section className="panel">
          <div className="integration-title">
            <span className="store-mark feed">{`{ }`}</span>
            <div>
              <h2>Feed JSON</h2>
              <p>Seu fornecedor, API ou n8n</p>
            </div>
          </div>
          <p className="source-description">
            Use um endpoint HTTPS que forneça ofertas autorizadas com links de
            afiliado. Funciona para Mercado Livre e outras lojas, sem depender
            de copiar produtos um por um.
          </p>
          <label>
            Token Bearer do feed (opcional)
            <input
              type="password"
              autoComplete="new-password"
              value={keys.FEED_TOKEN}
              onChange={(e) => setKeys({ ...keys, FEED_TOKEN: e.target.value })}
              placeholder={
                status.feedTokenConfigured
                  ? "Token salvo · vazio mantém"
                  : "Se o seu endpoint exigir autenticação"
              }
            />
          </label>
          <button className="button" disabled={busy} onClick={() => void act()}>
            Salvar token
          </button>
          <p className="footnote">
            O token é enviado apenas para a URL de feed configurada. Use
            endpoints de sua confiança. A URL fica na etapa Buscar ofertas do
            fluxo.
          </p>
          <details className="feed-contract">
            <summary>Ver formato do feed</summary>
            <pre>
              {JSON.stringify(
                {
                  products: [
                    {
                      id: "produto-123",
                      title: "Teclado mecânico compacto",
                      store: "Mercado Livre",
                      url: "https://loja.exemplo.com/produto",
                      affiliateUrl:
                        "https://loja.exemplo.com/seu-link-comissionado",
                      price: 149.9,
                      oldPrice: 199.9,
                      imageUrl: "https://loja.exemplo.com/foto.jpg",
                      description: "Layout ABNT2, conexão USB e iluminação RGB",
                      coupon: "",
                    },
                  ],
                },
                null,
                2,
              )}
            </pre>
          </details>
        </section>
      </div>

    </div>
  );
}

const widgetNames = {
  metrics: "Indicadores",
  offers: "Ofertas recentes",
  chart: "Gráfico de cliques",
  actions: "Atalhos de operação",
};
export function WorkspaceSettings({
  api,
  preferences,
  onSave,
}: {
  api: Api;
  preferences: Preferences;
  onSave: (p: Preferences) => void;
}) {
  const [form, setForm] = useState(preferences),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  function change(p: Partial<Preferences>) {
    setForm((f) => ({ ...f, ...p }));
    setMessage("");
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const p = await api<Preferences>("preferences", "PUT", form);
      onSave(p);
      setMessage("Seu painel e a voz da IA foram atualizados.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="customize-layout"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {message && (
        <div className="alert success" role="status">
          <Check size={18} />
          {message}
        </div>
      )}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <section className="panel">
        <div className="integration-title">
          <Palette size={22} />
          <h2>Um painel com a sua cara</h2>
        </div>
        <label>
          Nome do workspace
          <input
            maxLength={50}
            required
            value={form.workspaceName}
            onChange={(e) => change({ workspaceName: e.target.value })}
          />
        </label>
        <fieldset className="color-options">
          <legend>Cor de destaque</legend>
          {(["terracotta", "forest", "ocean", "violet"] as const).map(
            (color, i) => (
              <label key={color} className={`swatch swatch-${color}`}>
                <input
                  type="radio"
                  name="accent"
                  checked={form.accent === color}
                  onChange={() => change({ accent: color })}
                />
                <span>{["Terracota", "Floresta", "Oceano", "Violeta"][i]}</span>
              </label>
            ),
          )}
        </fieldset>
        <label>
          Densidade
          <select
            value={form.density}
            onChange={(e) =>
              change({ density: e.target.value as Preferences["density"] })
            }
          >
            <option value="comfortable">Confortável · mais respiro</option>
            <option value="compact">Compacta · mais conteúdo</option>
          </select>
        </label>
        <h3 className="customize-subtitle">Blocos da visão geral</h3>
        <p>Escolha o que aparece e a ordem dos blocos.</p>
        <div className="widget-options">
          {[
            ...form.widgets,
            ...(Object.keys(widgetNames) as Preferences["widgets"]).filter(
              (w) => !form.widgets.includes(w),
            ),
          ].map((w, i) => (
            <div key={w}>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={form.widgets.includes(w)}
                  onChange={(e) =>
                    change({
                      widgets: e.target.checked
                        ? [...form.widgets, w]
                        : form.widgets.filter((v) => v !== w),
                    })
                  }
                />
                {widgetNames[w]}
              </label>
              <button
                type="button"
                aria-label={`Mover ${widgetNames[w]} para cima`}
                disabled={!form.widgets.includes(w) || i === 0}
                onClick={() => {
                  const widgets = [...form.widgets];
                  [widgets[i - 1], widgets[i]] = [widgets[i], widgets[i - 1]];
                  change({ widgets });
                }}
              >
                <ArrowUp size={17} />
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="integration-title">
          <Sparkles size={22} />
          <h2>Voz editorial da IA</h2>
        </div>
        <p>
          A IA recebe características reais do produto e estas preferências. O
          texto deve soar como o seu canal, sem inventar benefícios.
        </p>
        <label>
          Estilo padrão
          <select
            value={form.style}
            onChange={(e) =>
              change({ style: e.target.value as Preferences["style"] })
            }
          >
            <option value="resenha">Resenha entre amigos</option>
            <option value="gamer">Gamer / setup</option>
            <option value="direto">Direto ao ponto</option>
            <option value="premium">Elegante</option>
          </select>
        </label>
        <label>
          Para quem você escreve?
          <input
            maxLength={250}
            value={form.audience}
            onChange={(e) => change({ audience: e.target.value })}
          />
        </label>
        <label>
          Instruções do canal
          <textarea
            rows={4}
            maxLength={1800}
            value={form.customPrompt}
            onChange={(e) => change({ customPrompt: e.target.value })}
            placeholder="Use tu, seja leve, explique o que o produto faz e evite clichês de propaganda."
          />
        </label>
        <label>
          Exemplos de chamadas no seu estilo
          <textarea
            rows={4}
            maxLength={1800}
            value={form.examples}
            onChange={(e) => change({ examples: e.target.value })}
          />
        </label>
        <p className="footnote">
          O fluxo pode escolher outro estilo por etapa. Preço, cupom, link e
          aviso de afiliado são adicionados pelo sistema, fora do texto gerado.
        </p>
      </section>
      <div className="customize-save">
        <button className="button primary" disabled={busy}>
          <Save size={17} />
          {busy ? "Salvando…" : "Salvar personalização"}
        </button>
      </div>
    </form>
  );
}
